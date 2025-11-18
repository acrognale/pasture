mod registry;
mod util;

pub mod approvals;
pub mod auth;
pub mod composer;
pub mod conversations;
pub mod review;
pub mod workspace;

pub use registry::CommandDescriptor;

use registry::codex_command_descriptors;

codex_command_descriptors! {
    conversations::list_conversations {
        params: conversations::ListConversationsParams,
        result: conversations::ListConversationsResponse,
    },
    conversations::initialize_conversation {
        params: conversations::InitializeConversationParams,
        result: conversations::InitializeConversationResponse,
    },
    conversations::new_conversation {
        params: conversations::NewConversationCommandParams,
        result: conversations::NewConversationResponse,
    },
    conversations::send_user_message {
        params: conversations::SendUserMessageParams,
        result: (),
    },
    review::get_turn_diff_range {
        params: review::GetTurnDiffRangeParams,
        result: review::GetTurnDiffRangeResponse,
    },
    review::list_turn_snapshots {
        params: review::ListTurnSnapshotsParams,
        result: review::ListTurnSnapshotsResponse,
    },
    conversations::compact_conversation {
        params: conversations::CompactConversationParams,
        result: (),
    },
    conversations::interrupt_conversation {
        params: conversations::InterruptConversationParams,
        result: conversations::InterruptConversationResponse,
    },
    composer::get_composer_config {
        params: composer::GetComposerConfigParams,
        result: composer::ComposerTurnConfigPayload,
    },
    composer::update_composer_config {
        params: composer::UpdateComposerConfigParams,
        result: (),
    },
    conversations::add_conversation_listener {
        params: conversations::AddConversationListenerParams,
        result: conversations::AddConversationSubscriptionResponse,
    },
    conversations::remove_conversation_listener {
        params: conversations::RemoveConversationListenerParams,
        result: (),
    },
    approvals::respond_approval {
        params: approvals::RespondApprovalParams,
        result: (),
    },
    workspace::get_workspace_composer_defaults {
        params: workspace::WorkspacePathParams,
        result: crate::workspace_manager::WorkspaceComposerDefaults,
    },
    workspace::list_recent_workspaces {
        params: (),
        result: Vec<String>,
    },
    workspace::open_workspace {
        params: workspace::WorkspacePathParams,
        result: String,
    },
    workspace::create_workspace_window {
        params: workspace::WorkspacePathParams,
        result: (),
    },
    workspace::set_window_title {
        params: workspace::SetWindowTitleParams,
        result: (),
    },
    workspace::browse_for_workspace {
        params: (),
        result: Option<String>,
    },
    auth::get_auth_state {
        params: (),
        result: auth::AuthState,
    },
}
