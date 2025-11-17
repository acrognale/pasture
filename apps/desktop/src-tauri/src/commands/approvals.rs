use codex_protocol::ConversationId;
use codex_protocol::protocol::Op;
use codex_protocol::protocol::ReviewDecision;
use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::codex_runtime::CodexRuntime;

use super::util::CommandResult;

/// Parameters accepted when responding to an approval request.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct RespondApprovalParams {
    pub conversation_id: ConversationId,
    pub event_id: String,
    pub decision: String,
    pub approval_type: String,
}

fn map_decision(decision: &str, allow_session: bool) -> Result<ReviewDecision, String> {
    match decision {
        "approved" => Ok(ReviewDecision::Approved),
        "approved_for_session" if allow_session => Ok(ReviewDecision::ApprovedForSession),
        "approved_for_session" => {
            Err("approved_for_session is not valid for this approval".to_string())
        }
        "abort" => Ok(ReviewDecision::Abort),
        "denied" => Ok(ReviewDecision::Denied),
        _ => Err(format!("Invalid decision: {}", decision)),
    }
}

/// Respond to an approval request.
#[tauri::command]
pub async fn respond_approval(
    params: RespondApprovalParams,
    runtime: State<'_, CodexRuntime>,
) -> CommandResult<()> {
    let conversation = runtime
        .conversation_manager()
        .get_conversation(params.conversation_id)
        .await
        .map_err(|e| format!("Failed to get conversation: {}", e))?;

    match params.approval_type.as_str() {
        "exec" => {
            let decision_enum = map_decision(params.decision.as_str(), true)?;
            conversation
                .submit(Op::ExecApproval {
                    id: params.event_id,
                    decision: decision_enum,
                })
                .await
                .map_err(|e| format!("Failed to submit exec approval: {}", e))?;
        }
        "patch" => {
            let decision_enum = map_decision(params.decision.as_str(), false)?;
            conversation
                .submit(Op::PatchApproval {
                    id: params.event_id,
                    decision: decision_enum,
                })
                .await
                .map_err(|e| format!("Failed to submit patch approval: {}", e))?;
        }
        other => {
            return Err(format!("Unknown approval type: {}", other));
        }
    }

    Ok(())
}
