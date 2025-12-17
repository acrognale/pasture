use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;
use std::path::PathBuf;
use std::pin::Pin;
use std::process::Command;

use anyhow::Context;
use anyhow::Result as AnyResult;
use notify::RecursiveMode;
use notify::Watcher;
use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::sync::oneshot;
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::WorkspacePath;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct RepoChangedPayload {
    pub workspace_path: String,
}

#[derive(Debug)]
struct RepoEntry {
    subscriptions: HashMap<Uuid, String>,
}

#[derive(Debug)]
struct RepoWatcher {
    entry: std::sync::Arc<Mutex<RepoEntry>>,
    cancel_tx: oneshot::Sender<()>,
}

#[derive(Debug, Default)]
pub struct RepoWatchManager {
    repos: Mutex<HashMap<PathBuf, RepoWatcher>>,
    by_subscription: Mutex<HashMap<Uuid, PathBuf>>,
}

impl RepoWatchManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn start(
        &self,
        app_handle: AppHandle,
        workspace_path: WorkspacePath,
    ) -> AnyResult<Uuid> {
        let repo_root = resolve_repo_root(&workspace_path).await?;
        let subscription_id = Uuid::new_v4();

        let mut repos = self.repos.lock().await;
        if let Some(watcher) = repos.get_mut(&repo_root) {
            watcher
                .entry
                .lock()
                .await
                .subscriptions
                .insert(subscription_id, workspace_path.into_string());
        } else {
            let entry = std::sync::Arc::new(Mutex::new(RepoEntry {
                subscriptions: HashMap::from([(subscription_id, workspace_path.into_string())]),
            }));
            let (cancel_tx, cancel_rx) = oneshot::channel();
            let entry_clone = entry.clone();
            let app_handle_clone = app_handle.clone();
            let repo_root_clone = repo_root.clone();
            tokio::spawn(async move {
                if let Err(err) =
                    run_repo_watcher(app_handle_clone, repo_root_clone, entry_clone, cancel_rx)
                        .await
                {
                    tracing::debug!(error = %err, "Repo watcher exited with error");
                }
            });

            repos.insert(repo_root.clone(), RepoWatcher { entry, cancel_tx });
        }
        drop(repos);

        self.by_subscription
            .lock()
            .await
            .insert(subscription_id, repo_root);

        Ok(subscription_id)
    }

    pub async fn stop(&self, subscription_id: Uuid) {
        let repo_root = self.by_subscription.lock().await.remove(&subscription_id);
        let Some(repo_root) = repo_root else {
            return;
        };

        let mut repos = self.repos.lock().await;
        let Some(watcher) = repos.get_mut(&repo_root) else {
            return;
        };

        {
            let mut entry = watcher.entry.lock().await;
            entry.subscriptions.remove(&subscription_id);
            if !entry.subscriptions.is_empty() {
                return;
            }
        }

        let watcher = repos.remove(&repo_root);
        drop(repos);

        if let Some(watcher) = watcher {
            let _ = watcher.cancel_tx.send(());
        }
    }
}

async fn resolve_repo_root(workspace_path: &WorkspacePath) -> AnyResult<PathBuf> {
    let workspace = workspace_path.as_str().to_string();
    tokio::task::spawn_blocking(move || -> AnyResult<PathBuf> {
        let output = Command::new("git")
            .args(["-C", &workspace, "rev-parse", "--show-toplevel"])
            .output()
            .with_context(|| format!("failed to execute git rev-parse in {}", workspace))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!(
                "workspace is not a git repository: {}",
                stderr.trim()
            ));
        }
        let stdout =
            String::from_utf8(output.stdout).context("git rev-parse produced invalid UTF-8")?;
        Ok(PathBuf::from(stdout.trim())
            .canonicalize()
            .context("failed to canonicalize repo root")?)
    })
    .await?
}

async fn run_repo_watcher(
    app_handle: AppHandle,
    repo_root: PathBuf,
    entry: std::sync::Arc<Mutex<RepoEntry>>,
    mut cancel_rx: oneshot::Receiver<()>,
) -> AnyResult<()> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<notify::Result<notify::Event>>();

    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })?;
    watcher.watch(&repo_root, RecursiveMode::Recursive)?;

    let mut pending = Vec::<PathBuf>::new();
    let debounce = std::time::Duration::from_millis(350);
    let mut debounce_sleep: Option<Pin<Box<tokio::time::Sleep>>> = None;

    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                break;
            }
            maybe = rx.recv() => {
                match maybe {
                    None => break,
                    Some(Ok(event)) => {
                        if event.paths.is_empty() {
                            pending.push(repo_root.clone());
                        } else {
                            pending.extend(event.paths);
                        }
                        debounce_sleep = Some(Box::pin(tokio::time::sleep(debounce)));
                    }
                    Some(Err(_err)) => {
                        pending.push(repo_root.clone());
                        debounce_sleep = Some(Box::pin(tokio::time::sleep(debounce)));
                    }
                }
            }
            _ = async {
                if let Some(sleep) = &mut debounce_sleep {
                    sleep.as_mut().await;
                }
            }, if debounce_sleep.is_some() => {
                debounce_sleep = None;

                if pending.is_empty() {
                    continue;
                }

                let should_emit = should_emit_for_paths(&repo_root, &pending).await;
                pending.clear();

                if !should_emit {
                    continue;
                }

                let workspaces: Vec<String> = {
                    let entry = entry.lock().await;
                    entry.subscriptions.values().cloned().collect()
                };

                for workspace_path in workspaces {
                    let _ = app_handle.emit(
                        "repo://changed",
                        RepoChangedPayload { workspace_path },
                    );
                }
            }
        }
    }

    Ok(())
}

async fn should_emit_for_paths(repo_root: &Path, paths: &[PathBuf]) -> bool {
    let mut unique = HashSet::<String>::new();

    for path in paths {
        let Ok(rel) = path.strip_prefix(repo_root) else {
            continue;
        };

        if is_git_internal_path(rel) {
            return true;
        }

        let mut rel_str = rel.to_string_lossy().to_string();
        if std::path::MAIN_SEPARATOR != '/' {
            rel_str = rel_str.replace(std::path::MAIN_SEPARATOR, "/");
        }
        if !rel_str.is_empty() {
            unique.insert(rel_str);
        }
    }

    if unique.is_empty() {
        return true;
    }

    let rel_paths: Vec<String> = unique.into_iter().collect();
    match git_check_ignored(repo_root, &rel_paths).await {
        Ok(ignored) => rel_paths.iter().any(|p| !ignored.contains(p)),
        Err(_) => true,
    }
}

fn is_git_internal_path(rel: &Path) -> bool {
    let mut comps = rel.components();
    matches!(
        comps.next().and_then(|c| c.as_os_str().to_str()),
        Some(".git")
    )
}

async fn git_check_ignored(repo_root: &Path, rel_paths: &[String]) -> AnyResult<HashSet<String>> {
    let repo_root = repo_root.to_path_buf();
    let rel_paths = rel_paths.to_vec();

    tokio::task::spawn_blocking(move || -> AnyResult<HashSet<String>> {
        let mut child = Command::new("git")
            .args([
                "-C",
                repo_root
                    .to_str()
                    .context("repo root contains invalid UTF-8")?,
                "check-ignore",
                "--stdin",
                "-z",
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("failed to spawn git check-ignore")?;

        {
            use std::io::Write;
            let stdin = child
                .stdin
                .as_mut()
                .context("missing git check-ignore stdin")?;
            for p in &rel_paths {
                stdin.write_all(p.as_bytes())?;
                stdin.write_all(&[0])?;
            }
        }

        let output = child
            .wait_with_output()
            .context("failed to read git check-ignore output")?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!(
                "git check-ignore failed: {}",
                stderr.trim()
            ));
        }

        let mut ignored = HashSet::new();
        for chunk in output.stdout.split(|b| *b == 0) {
            if chunk.is_empty() {
                continue;
            }
            ignored.insert(String::from_utf8_lossy(chunk).to_string());
        }
        Ok(ignored)
    })
    .await?
}
