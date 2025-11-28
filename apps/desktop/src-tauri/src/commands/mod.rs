mod registry;

pub mod approvals;
pub mod auth;
pub mod composer;
pub mod review;
pub mod subscriptions;
pub mod threads;
pub mod turns;
pub mod update;
pub mod workspace;

pub use registry::CommandDescriptor;

use registry::codex_command_descriptors;

codex_command_descriptors! {
    threads::list_threads {
        params: threads::ListThreadsParams,
        result: threads::ListThreadsResponse,
    },
    threads::list_thread_conversations {
        params: threads::ListThreadConversationsParams,
        result: threads::ListThreadConversationsResponse,
    },
    threads::switch_conversation {
        params: threads::SwitchConversationParams,
        result: threads::SwitchConversationResponse,
    },
    threads::new_thread {
        params: threads::NewThreadCommandParams,
        result: threads::NewThreadResponse,
    },
    threads::initialize_thread {
        params: threads::InitializeThreadParams,
        result: threads::InitializeThreadResponse,
    },
    threads::fork_conversation {
        params: threads::ForkConversationParams,
        result: threads::ForkConversationResponse,
    },
    turns::send_user_message {
        params: turns::SendUserMessageParams,
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
    turns::compact_conversation {
        params: turns::CompactConversationParams,
        result: (),
    },
    turns::interrupt_conversation {
        params: turns::InterruptConversationParams,
        result: turns::InterruptConversationResponse,
    },
    composer::get_composer_config {
        params: composer::GetComposerConfigParams,
        result: composer::ComposerTurnConfigPayload,
    },
    composer::update_composer_config {
        params: composer::UpdateComposerConfigParams,
        result: (),
    },
    subscriptions::add_conversation_listener {
        params: subscriptions::AddConversationListenerParams,
        result: subscriptions::AddConversationSubscriptionResponse,
    },
    subscriptions::remove_conversation_listener {
        params: subscriptions::RemoveConversationListenerParams,
        result: (),
    },
    approvals::respond_approval {
        params: approvals::RespondApprovalParams,
        result: (),
    },
    workspace::get_workspace_composer_defaults {
        params: workspace::WorkspacePathParams,
        result: crate::domain::WorkspaceSettings,
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
        result: crate::auth::AuthState,
    },
    update::check_for_update {
        params: (),
        result: Option<update::UpdateInfo>,
    },
    update::install_update {
        params: (),
        result: (),
    },
}
