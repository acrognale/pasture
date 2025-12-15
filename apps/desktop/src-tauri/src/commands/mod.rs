mod registry;

pub mod approvals;
pub mod auth;
pub mod composer;
pub mod files;
pub mod images;
pub mod message_comments;
pub mod review;
pub mod subscriptions;
pub mod symbols;
pub mod thread_search;
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
    message_comments::list_message_comments {
        params: message_comments::ListMessageCommentsParams,
        result: message_comments::ListMessageCommentsResponse,
    },
    message_comments::create_message_comment {
        params: message_comments::CreateMessageCommentParams,
        result: message_comments::CreateMessageCommentResponse,
    },
    message_comments::update_message_comment {
        params: message_comments::UpdateMessageCommentParams,
        result: (),
    },
    message_comments::set_message_comments_submitted {
        params: message_comments::SetMessageCommentsSubmittedParams,
        result: (),
    },
    message_comments::delete_message_comment {
        params: message_comments::DeleteMessageCommentParams,
        result: (),
    },
    turns::send_user_message {
        params: turns::SendUserMessageParams,
        result: (),
    },
    images::save_pasted_image {
        params: images::SavePastedImageParams,
        result: images::SavePastedImageResponse,
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
    turns::review_map_conversation {
        params: turns::ReviewMapConversationParams,
        result: (),
    },
    turns::handoff_conversation {
        params: turns::HandoffConversationParams,
        result: turns::HandoffConversationResponse,
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
    workspace::update_workspace_settings {
        params: workspace::UpdateWorkspaceSettingsParams,
        result: crate::domain::WorkspaceSettings,
    },
    files::search_workspace_files {
        params: files::SearchWorkspaceFilesParams,
        result: Vec<files::WorkspaceFileHit>,
    },
    symbols::search_workspace_symbols {
        params: symbols::SearchWorkspaceSymbolsParams,
        result: Vec<crate::symbol_index::WorkspaceSymbolHit>,
    },
    thread_search::search_threads {
        params: thread_search::SearchThreadsParams,
        result: thread_search::SearchThreadsResponse,
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
