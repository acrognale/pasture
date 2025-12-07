use std::collections::BTreeSet;
use std::collections::HashSet;
use std::path::Path;

use codex_core::Prompt;
use codex_core::RolloutRecorder;
use codex_core::content_items_to_text;
use codex_protocol::ConversationId;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::RolloutItem;
use sea_orm::EntityTrait;
use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use tokio::process::Command;

use crate::context::WorkspaceContext;
use crate::db::db_err;
use crate::db::schema;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::review;

#[derive(Debug, Clone)]
pub struct HandoffPlanInput {
    pub goal: String,
    pub full_transcript_text: String,
    pub candidate_files: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct HandoffPlan {
    pub title: Option<String>,
    pub composer_prompt: String,
    pub preview: Option<String>,
    pub relevant_files: Vec<HandoffFileRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffFileRef {
    pub path: String,
    #[serde(default)]
    pub reason: String,
}

impl HandoffPlanInput {
    pub async fn from_conversation(
        ctx: &WorkspaceContext,
        conversation_id: &ConversationId,
        goal: String,
    ) -> AppResult<Self> {
        let full_transcript_text = render_full_transcript_text(ctx, conversation_id).await?;

        let candidate_files = collect_candidate_files_from_snapshots(ctx, conversation_id).await?;

        Ok(HandoffPlanInput {
            goal,
            full_transcript_text,
            candidate_files,
        })
    }
}

pub async fn plan_handoff(
    ctx: &WorkspaceContext,
    conversation_id: &ConversationId,
    input: HandoffPlanInput,
) -> AppResult<HandoffPlan> {
    use crate::completions::ModelConfig;
    use crate::completions::{self};
    use codex_core::AuthManager;
    use std::sync::Arc;

    let base_config = Arc::new(ctx.config().clone());
    let auth: Arc<AuthManager> = ctx.auth();

    let prompt = build_handoff_prompt(&input);

    let model_config = ModelConfig {
        model: "gpt-5.1".to_string(),
        reasoning_effort: Some(codex_protocol::openai_models::ReasoningEffort::Low),
    };

    let text = completions::generate_text(
        base_config,
        auth,
        *conversation_id,
        &prompt,
        Some(model_config),
    )
    .await
    .map_err(|err| AppError::Codex(format!("Handoff planner failed: {err}")))?;

    let Some(text) = text else {
        return Err(AppError::Codex(
            "Handoff planner returned no content".to_string(),
        ));
    };

    parse_handoff_plan(&text, input)
}

fn build_handoff_prompt(input: &HandoffPlanInput) -> Prompt {
    use codex_core::ResponseItem;

    let mut prompt = Prompt::default();

    prompt.input.push(ResponseItem::Message {
        id: None,
        role: "developer".to_string(),
        content: vec![ContentItem::InputText {
            text: build_developer_instructions(),
        }],
    });

    prompt.input.push(ResponseItem::Message {
        id: None,
        role: "user".to_string(),
        content: vec![ContentItem::InputText {
            text: build_user_payload(input),
        }],
    });

    prompt.output_schema = Some(json!({
        "type": "object",
        "properties": {
            "title": { "type": "string" },
            "composer_prompt": { "type": "string" },
            "relevant_files": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "reason": { "type": "string" }
                    },
                    "required": ["path", "reason"],
                    "additionalProperties": false
                }
            },
            "preview": { "type": "string" }
        },
        "required": ["composer_prompt", "title", "relevant_files", "preview"],
        "additionalProperties": false
    }));

    prompt
}

fn build_developer_instructions() -> String {
    r#"You are Pasture's Handoff planner.

A user is working with a coding agent in an existing thread. They now want to start a NEW, focused thread that continues the work, but does not carry over the full conversation history directly.

Your job is to:
- Understand the user's stated goal for the new thread.
- Extract only the essential context from the existing conversation.
- Identify a small set of repository files that matter for the next task.
- Produce a single user-facing prompt that will be prefilled into the new thread's composer.

You will receive:
- A short natural-language goal for the new thread (may be empty).
- The FULL conversation history for the current thread, oldest to newest, as plain text.
- A list of candidate file paths that were read, edited, or discussed.

You must output a JSON object with this shape:
- \"title\": short 3–7 word name for the new thread (for example: \"Refactor auth middleware\"). Optional but recommended.
- \"composer_prompt\": a plain-text prompt that the user will send as the FIRST message in the new thread.
  - Write in the first person as if the user is speaking to the agent.
  - Briefly describe what has already been done in the previous thread.
  - Clearly state the goal for this new thread and what you want the agent to do first.
  - Keep it under roughly 400 words.
- \"relevant_files\": an array of objects { \"path\": string, \"reason\": string } listing the repo files that matter most for this new thread.

Constraints:
- Do NOT invent file paths. Each \"path\" MUST come from the provided candidate file list.
- Prefer at most 10 entries in \"relevant_files\", focusing on the highest-signal files.
- When you mention a file in \"composer_prompt\", refer to it using @relative/path.ext so the UI can render it as a file mention.
- Do NOT include code fences, JSON, or backticks in \"composer_prompt\"; it should be plain natural language plus inline @file/path references.

If the user goal is empty, infer the best next goal from the most recent user and assistant messages.

Respond ONLY with the JSON object, with no extra commentary."#
        .to_string()
}

fn build_user_payload(input: &HandoffPlanInput) -> String {
    let goal = if input.goal.trim().is_empty() {
        "(no explicit goal provided; infer from the conversation)".to_string()
    } else {
        input.goal.trim().to_string()
    };

    let mut payload = String::new();
    payload.push_str("GOAL FOR NEW THREAD:\n\n");
    payload.push_str(&goal);
    payload.push_str("\n\nFULL CONVERSATION HISTORY (OLDEST FIRST):\n\n");
    payload.push_str(input.full_transcript_text.trim());
    payload.push_str("\n\nCANDIDATE FILES (RELATIVE TO WORKSPACE ROOT):\n");

    if input.candidate_files.is_empty() {
        payload.push_str("(none)\n");
    } else {
        for path in &input.candidate_files {
            payload.push_str("- ");
            payload.push_str(path);
            payload.push('\n');
        }
    }

    payload
}

pub fn parse_handoff_plan(text: &str, input: HandoffPlanInput) -> AppResult<HandoffPlan> {
    #[derive(Debug, Deserialize)]
    struct PlanFileRef {
        path: String,
        #[serde(default)]
        reason: String,
    }

    #[derive(Debug, Deserialize)]
    struct PlanPayload {
        #[serde(default)]
        title: Option<String>,
        composer_prompt: Option<String>,
        #[serde(default)]
        preview: Option<String>,
        #[serde(default)]
        relevant_files: Vec<PlanFileRef>,
    }

    let parsed = serde_json::from_str::<PlanPayload>(text);
    let mut title = None;
    let mut composer_prompt = None;
    let mut relevant_files: Vec<HandoffFileRef> = Vec::new();
    let mut preview = None;

    if let Ok(payload) = parsed {
        composer_prompt = payload
            .composer_prompt
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        title = payload
            .title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        preview = payload
            .preview
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let candidates: HashSet<String> = input.candidate_files.into_iter().collect();
        relevant_files = payload
            .relevant_files
            .into_iter()
            .filter_map(|file| {
                if candidates.contains(&file.path) {
                    Some(HandoffFileRef {
                        path: file.path,
                        reason: file.reason,
                    })
                } else {
                    None
                }
            })
            .collect();
    }

    let composer_prompt = composer_prompt.unwrap_or_else(|| text.trim().to_string());

    if composer_prompt.is_empty() {
        return Err(AppError::Codex(
            "Handoff planner returned an empty prompt".to_string(),
        ));
    }

    Ok(HandoffPlan {
        title,
        composer_prompt,
        preview,
        relevant_files,
    })
}

async fn render_full_transcript_text(
    ctx: &WorkspaceContext,
    conversation_id: &ConversationId,
) -> AppResult<String> {
    let conversation = schema::conversations::Entity::find_by_id(conversation_id.to_string())
        .one(ctx.db())
        .await
        .map_err(|e| db_err("load conversation for handoff", e))?
        .ok_or(AppError::NotFound {
            entity: "conversation",
        })?;

    let history = RolloutRecorder::get_rollout_history(Path::new(&conversation.rollout_path))
        .await
        .map_err(|err| {
            AppError::Codex(format!(
                "Failed to read conversation history for {}: {}",
                conversation_id, err
            ))
        })?;

    let items = history.get_rollout_items();
    let mut transcript = Vec::new();

    for item in items {
        match item {
            RolloutItem::ResponseItem(response) => {
                push_response_item(&mut transcript, &response);
            }
            RolloutItem::Compacted(compacted) => {
                let response: ResponseItem = compacted.into();
                push_response_item(&mut transcript, &response);
            }
            _ => {}
        }
    }

    Ok(transcript.join("\n\n"))
}

fn push_response_item(transcript: &mut Vec<String>, response: &ResponseItem) {
    if let ResponseItem::Message { role, content, .. } = response {
        if let Some(text) = content_items_to_text(content) {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return;
            }
            let label = match role.as_str() {
                "user" => "User",
                "assistant" => "Assistant",
                "system" => "System",
                "developer" => "Developer",
                _ => "Message",
            };
            transcript.push(format!("{label}: {trimmed}"));
        }
    }
}

async fn collect_candidate_files_from_snapshots(
    ctx: &WorkspaceContext,
    conversation_id: &ConversationId,
) -> AppResult<Vec<String>> {
    let summary = match review::snapshot_summary(ctx.db(), conversation_id).await {
        Ok(summary) => summary,
        Err(AppError::NotFound { .. }) => return Ok(Vec::new()),
        Err(err) => return Err(err),
    };

    if summary.disabled {
        return Ok(Vec::new());
    }

    let Some(base_commit) = summary.base_commit else {
        return Ok(Vec::new());
    };
    let Some(latest) = summary.snapshots.last() else {
        return Ok(Vec::new());
    };

    let diff_paths = git_diff_names(
        Path::new(ctx.path.as_str()),
        &base_commit,
        &latest.commit_sha,
    )
    .await;

    let mut unique = BTreeSet::new();
    for path in diff_paths.unwrap_or_default() {
        unique.insert(path);
    }

    Ok(unique.into_iter().take(50).collect())
}

async fn git_diff_names(
    workspace_path: &Path,
    base_commit: &str,
    target_commit: &str,
) -> Option<Vec<String>> {
    let output = Command::new("git")
        .arg("diff")
        .arg("--name-only")
        .arg(base_commit)
        .arg(target_commit)
        .current_dir(workspace_path)
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        log::debug!(
            "git diff --name-only failed for {}..{} (status: {})",
            base_commit,
            target_commit,
            output.status
        );
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut seen = HashSet::new();
    let mut paths = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let normalized = normalize_workspace_path(workspace_path, Path::new(trimmed))
            .unwrap_or_else(|| trimmed.to_string());
        if seen.insert(normalized.clone()) {
            paths.push(normalized);
        }
    }

    if paths.is_empty() { None } else { Some(paths) }
}

fn normalize_workspace_path(workspace_path: &Path, path: &Path) -> Option<String> {
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        workspace_path.join(path)
    };

    joined
        .strip_prefix(workspace_path)
        .ok()
        .map(|value| value.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_handoff_plan_with_filtering() {
        let input = HandoffPlanInput {
            goal: "do it".to_string(),
            full_transcript_text: "User: hi".to_string(),
            candidate_files: vec!["src/main.rs".to_string(), "README.md".to_string()],
        };

        let json = r#"{
            "title": "New thread",
            "composer_prompt": "Please continue",
            "relevant_files": [
                { "path": "src/main.rs", "reason": "changed" },
                { "path": "not/real.rs", "reason": "ignore" }
            ]
        }"#;

        let plan = parse_handoff_plan(json, input).unwrap();
        assert_eq!(plan.title.as_deref(), Some("New thread"));
        assert_eq!(plan.composer_prompt, "Please continue");
        assert_eq!(plan.relevant_files.len(), 1);
        assert_eq!(plan.relevant_files[0].path, "src/main.rs");
    }

    #[test]
    fn falls_back_to_text_on_invalid_json() {
        let input = HandoffPlanInput {
            goal: "".to_string(),
            full_transcript_text: "".to_string(),
            candidate_files: vec![],
        };

        let plan = parse_handoff_plan("plain text", input).unwrap();
        assert!(plan.title.is_none());
        assert_eq!(plan.composer_prompt, "plain text");
    }

    #[test]
    fn build_user_payload_includes_defaults() {
        let input = HandoffPlanInput {
            goal: "".to_string(),
            full_transcript_text: "User: hi".to_string(),
            candidate_files: vec![],
        };

        let payload = build_user_payload(&input);
        assert!(payload.contains("GOAL FOR NEW THREAD:"));
        assert!(payload.contains("FULL CONVERSATION HISTORY"));
        assert!(payload.contains("(none)"));
    }
}
