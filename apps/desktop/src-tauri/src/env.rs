use std::collections::HashMap;
use std::path::Path;

use codex_core::config::Config;
use codex_core::config::types::ShellEnvironmentPolicyInherit;

/// Populate the config with environment variables captured from the user's login shell.
pub async fn apply_shell_environment_defaults(config: &mut Config) {
    let disable_shell_profile = std::env::var("CODEX_DISABLE_SHELL_PROFILE")
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false);

    if disable_shell_profile {
        log::info!("Shell profile sourcing disabled via CODEX_DISABLE_SHELL_PROFILE");
        return;
    }

    config.shell_environment_policy.use_profile = false;
    config.shell_environment_policy.inherit = ShellEnvironmentPolicyInherit::None;

    if let Some(env) = capture_login_shell_environment(None).await {
        let rset = &mut config.shell_environment_policy.r#set;
        for (key, value) in env {
            rset.insert(key, value);
        }

        if let Some(path) = rset.get("PATH") {
            log::info!("Captured login PATH: {}", path);
        } else {
            log::warn!("Login shell capture missing PATH entry");
        }
    } else {
        log::warn!("Failed to capture login shell environment; commands may miss user tooling");
    }
}

pub async fn capture_login_shell_environment(
    cwd: Option<&Path>,
) -> Option<HashMap<String, String>> {
    use tokio::process::Command;

    let shell = std::env::var("SHELL")
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if cfg!(target_os = "macos") {
                "/bin/zsh".to_string()
            } else {
                "/bin/bash".to_string()
            }
        });

    const SENTINEL: &str = "__CODEX_LOGIN_ENV_START__";
    let command = if let Some(path) = cwd {
        let quoted = shell_quote(path);
        format!("cd {quoted} && printf '{SENTINEL}\\0' && env -0")
    } else {
        format!("printf '{SENTINEL}\\0'; env -0")
    };

    let flag = match std::path::Path::new(&shell)
        .file_name()
        .and_then(|name| name.to_str())
    {
        Some("zsh") => "-ilc",
        Some("bash") => "-lic",
        _ => "-lc",
    };

    let output = Command::new(&shell)
        .arg(flag)
        .arg(&command)
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        log::warn!(
            "Login shell ({}) exited with status {}",
            shell,
            output.status
        );
        return None;
    }

    let stdout = output.stdout;
    let marker = format!("{SENTINEL}\0").into_bytes();
    let offset = stdout
        .windows(marker.len())
        .position(|window| window == marker.as_slice())
        .map(|index| index + marker.len())?;

    let env_bytes = &stdout[offset..];
    let mut env = HashMap::new();
    for entry in env_bytes.split(|byte| *byte == b'\0') {
        if entry.is_empty() {
            continue;
        }
        let Some(eq) = entry.iter().position(|byte| *byte == b'=') else {
            continue;
        };
        let key = String::from_utf8_lossy(&entry[..eq]).to_string();
        if key.is_empty() {
            continue;
        }
        let value = String::from_utf8_lossy(&entry[eq + 1..]).to_string();
        env.insert(key, value);
    }

    if env.is_empty() { None } else { Some(env) }
}

fn shell_quote(path: &Path) -> String {
    let raw = path.to_string_lossy();
    let mut quoted = String::with_capacity(raw.len() + 2);
    quoted.push('\'');
    for ch in raw.chars() {
        if ch == '\'' {
            quoted.push_str("'\\''");
        } else {
            quoted.push(ch);
        }
    }
    quoted.push('\'');
    quoted
}
