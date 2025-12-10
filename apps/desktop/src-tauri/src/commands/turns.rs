use std::path::PathBuf;

use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::protocol::AskForApproval;
use codex_protocol::protocol::Op;
use codex_protocol::protocol::TurnAbortReason;
use codex_protocol::user_input::UserInput as CoreUserInput;
use sea_orm::EntityTrait;
use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::State;
use ts_rs::TS;

use crate::context::WorkspaceContext;
use crate::db::schema;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::handoff::HandoffPlan;
use crate::handoff::collect_candidate_files_from_snapshots;
use crate::state::AppState;
use crate::threads;
use crate::turns::TurnOverrides;
use crate::turns::{self};

/// Wire representation of user-provided inputs.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type", content = "data")]
pub enum InputItem {
    Text {
        text: String,
    },
    Image {
        image_url: String,
    },
    LocalImage {
        #[ts(type = "string")]
        path: PathBuf,
    },
}

/// Parameters accepted when sending a user message.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SendUserMessageParams {
    pub conversation_id: String,
    pub items: Vec<InputItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<AskForApproval>,
}

/// Parameters accepted when compacting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct CompactConversationParams {
    pub conversation_id: String,
}

/// Parameters accepted when planning a handoff.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct HandoffConversationParams {
    pub conversation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub goal: Option<String>,
}

/// Response returned after planning a handoff.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct HandoffConversationResponse {
    pub thread_id: String,
    pub conversation_id: ConversationId,
    pub composer_draft: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Parameters accepted when interrupting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InterruptConversationParams {
    pub conversation_id: String,
}

/// Response returned when interrupting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InterruptConversationResponse {
    pub abort_reason: TurnAbortReason,
}

/// Send a user message to a conversation.
#[tauri::command]
pub async fn send_user_message(
    params: SendUserMessageParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let SendUserMessageParams {
        conversation_id,
        items,
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval_policy,
    } = params;

    let conversation_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let mapped_items: Vec<CoreUserInput> = items
        .into_iter()
        .map(|item| match item {
            InputItem::Text { text } => CoreUserInput::Text { text },
            InputItem::Image { image_url } => CoreUserInput::Image { image_url },
            InputItem::LocalImage { path } => CoreUserInput::LocalImage { path },
        })
        .collect();

    // Handle preview and title generation if we can find the workspace for this conversation
    if let Some(workspace_path) =
        threads::workspace_path_for_conversation(&app.db, &conversation_id).await?
    {
        if let Some(preview) = mapped_items
            .iter()
            .find_map(|item| match item {
                CoreUserInput::Text { text } => Some(text.trim()),
                _ => None,
            })
            .filter(|text| !text.is_empty())
        {
            let ctx = WorkspaceContext::new(workspace_path, &app);
            threads::handle_preview_and_title(
                &ctx,
                &conversation_id,
                preview.to_string(),
                app_handle.clone(),
            )
            .await;
        }
    }

    let overrides = TurnOverrides {
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval_policy,
    };

    turns::send(
        &app.conversations,
        &app.events,
        &conversation_id,
        mapped_items,
        overrides,
        &conversation_id.to_string(),
        app_handle,
    )
    .await?;

    Ok(())
}

/// Trigger the compact operation for a conversation.
#[tauri::command]
pub async fn compact_conversation(
    params: CompactConversationParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let conversation_id = params.conversation_id;
    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    turns::compact(
        &app.conversations,
        &app.events,
        &conv_id,
        &conversation_id,
        app_handle,
    )
    .await?;

    Ok(())
}

/// Plan a handoff and create a new thread with a drafted composer prompt.
#[tauri::command]
pub async fn handoff_conversation(
    params: HandoffConversationParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<HandoffConversationResponse> {
    use crate::codex_config::NewThreadOptions;

    let conversation_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let workspace_path = if let Some(workspace_path) =
        threads::workspace_path_for_conversation(&app.db, &conversation_id).await?
    {
        workspace_path
    } else {
        return Err(AppError::Validation {
            message: format!("No workspace found for conversation {}", conversation_id),
        });
    };

    let ctx = WorkspaceContext::new(workspace_path, &app);

    let source_thread_id =
        match schema::conversations::Entity::find_by_id(conversation_id.to_string())
            .one(&app.db)
            .await
        {
            Ok(Some(model)) => Some(model.thread_id),
            Ok(None) => {
                log::debug!(
                    "No conversation found while computing handoff prefix for {}",
                    conversation_id
                );
                None
            }
            Err(err) => {
                log::debug!(
                    "Failed to load conversation while computing handoff prefix for {}: {}",
                    conversation_id,
                    err
                );
                None
            }
        };

    let candidate_files =
        collect_candidate_files_from_snapshots(&ctx, &conversation_id).await.unwrap_or_default();

    // Ensure subscription so we can receive the handoff plan event.
    let conversation = app.conversations.get_conversation(conversation_id).await.map_err(
        |_| AppError::NotFound {
            entity: "conversation",
        },
    )?;
    let _ = app
        .events
        .ensure_subscription(
            conversation_id,
            conversation.clone(),
            app_handle.clone(),
            conversation_id.to_string(),
        )
        .await;

    // Submit the handoff op.
    conversation
        .submit(Op::Handoff {
            goal: params.goal.clone(),
            candidate_files: candidate_files.clone(),
        })
        .await
        .map_err(|e| AppError::Codex(format!("Failed to plan handoff: {}", e)))?;

    // Wait for the handoff plan event from Codex.
    let plan_event = app
        .events
        .wait_for_handoff_plan(&conversation_id)
        .await
        .map_err(|err| AppError::Codex(err.to_string()))?;

    let plan = HandoffPlan::from(plan_event);

    let options = NewThreadOptions::default();
    let (thread, new_conv) = threads::create(&ctx, options, app_handle.clone()).await?;

    threads::apply_handoff_metadata(&ctx, &app_handle, &thread, &conversation_id, &plan).await;

    let composer_draft = if let Some(thread_id) = source_thread_id {
        let prefix = format!(
            "Continuing work from @thread:{}. If you need specific information about that thread that wasn't provided, use `read_thread` to get it.",
            thread_id
        );

        if plan.composer_prompt.trim().is_empty() {
            prefix
        } else {
            format!("{}\n\n{}", prefix, plan.composer_prompt)
        }
    } else {
        plan.composer_prompt
    };

    Ok(HandoffConversationResponse {
        thread_id: thread.id.as_str().to_string(),
        conversation_id: new_conv.conversation_id,
        composer_draft,
        title: plan.title,
    })
}

/// Interrupt an active conversation.
#[tauri::command]
pub async fn interrupt_conversation(
    params: InterruptConversationParams,
    app: State<'_, AppState>,
) -> AppResult<InterruptConversationResponse> {
    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    turns::interrupt(&app.conversations, &conv_id).await?;

    Ok(InterruptConversationResponse {
        abort_reason: TurnAbortReason::Interrupted,
    })
}
