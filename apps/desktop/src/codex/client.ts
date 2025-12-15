// GENERATED CODE! DO NOT MODIFY BY HAND!
import type {
  AddConversationListenerParams,
  AddConversationSubscriptionResponse,
  AuthState,
  CompactConversationParams,
  ComposerTurnConfigPayload,
  CreateMessageCommentParams,
  CreateMessageCommentResponse,
  DeleteMessageCommentParams,
  ForkConversationParams,
  ForkConversationResponse,
  GetComposerConfigParams,
  GetRepoDiffParams,
  GetRepoDiffResponse,
  GetRepoFingerprintParams,
  GetRepoFingerprintResponse,
  GetTurnDiffRangeParams,
  GetTurnDiffRangeResponse,
  HandoffConversationParams,
  HandoffConversationResponse,
  InitializeThreadParams,
  InitializeThreadResponse,
  InterruptConversationParams,
  InterruptConversationResponse,
  ListMessageCommentsParams,
  ListMessageCommentsResponse,
  ListThreadConversationsParams,
  ListThreadConversationsResponse,
  ListThreadsParams,
  ListThreadsResponse,
  ListTurnSnapshotsParams,
  ListTurnSnapshotsResponse,
  NewThreadCommandParams,
  NewThreadResponse,
  RemoveConversationListenerParams,
  RespondApprovalParams,
  ReviewMapConversationParams,
  SavePastedImageParams,
  SavePastedImageResponse,
  SearchThreadsParams,
  SearchThreadsResponse,
  SearchWorkspaceFilesParams,
  SearchWorkspaceSymbolsParams,
  SendUserMessageParams,
  SetMessageCommentsSubmittedParams,
  SetWindowTitleParams,
  SwitchConversationParams,
  SwitchConversationResponse,
  UpdateComposerConfigParams,
  UpdateMessageCommentParams,
  UpdateWorkspaceSettingsParams,
  WorkspaceFileHit,
  WorkspacePathParams,
  WorkspaceSettings,
  WorkspaceSymbolHit,
} from '@pasture/protocol';
import { invoke } from '@tauri-apps/api/core';

export namespace Codex {
  export async function listThreads(
    params: ListThreadsParams
  ): Promise<ListThreadsResponse> {
    return await invoke<ListThreadsResponse>('list_threads', { params });
  }

  export async function listThreadConversations(
    params: ListThreadConversationsParams
  ): Promise<ListThreadConversationsResponse> {
    return await invoke<ListThreadConversationsResponse>(
      'list_thread_conversations',
      { params }
    );
  }

  export async function switchConversation(
    params: SwitchConversationParams
  ): Promise<SwitchConversationResponse> {
    return await invoke<SwitchConversationResponse>('switch_conversation', {
      params,
    });
  }

  export async function newThread(
    params: NewThreadCommandParams
  ): Promise<NewThreadResponse> {
    return await invoke<NewThreadResponse>('new_thread', { params });
  }

  export async function initializeThread(
    params: InitializeThreadParams
  ): Promise<InitializeThreadResponse> {
    return await invoke<InitializeThreadResponse>('initialize_thread', {
      params,
    });
  }

  export async function forkConversation(
    params: ForkConversationParams
  ): Promise<ForkConversationResponse> {
    return await invoke<ForkConversationResponse>('fork_conversation', {
      params,
    });
  }

  export async function listMessageComments(
    params: ListMessageCommentsParams
  ): Promise<ListMessageCommentsResponse> {
    return await invoke<ListMessageCommentsResponse>('list_message_comments', {
      params,
    });
  }

  export async function createMessageComment(
    params: CreateMessageCommentParams
  ): Promise<CreateMessageCommentResponse> {
    return await invoke<CreateMessageCommentResponse>(
      'create_message_comment',
      { params }
    );
  }

  export async function updateMessageComment(
    params: UpdateMessageCommentParams
  ): Promise<void> {
    return await invoke<void>('update_message_comment', { params });
  }

  export async function setMessageCommentsSubmitted(
    params: SetMessageCommentsSubmittedParams
  ): Promise<void> {
    return await invoke<void>('set_message_comments_submitted', { params });
  }

  export async function deleteMessageComment(
    params: DeleteMessageCommentParams
  ): Promise<void> {
    return await invoke<void>('delete_message_comment', { params });
  }

  export async function sendUserMessage(
    params: SendUserMessageParams
  ): Promise<void> {
    return await invoke<void>('send_user_message', { params });
  }

  export async function savePastedImage(
    params: SavePastedImageParams
  ): Promise<SavePastedImageResponse> {
    return await invoke<SavePastedImageResponse>('save_pasted_image', {
      params,
    });
  }

  export async function getTurnDiffRange(
    params: GetTurnDiffRangeParams
  ): Promise<GetTurnDiffRangeResponse> {
    return await invoke<GetTurnDiffRangeResponse>('get_turn_diff_range', {
      params,
    });
  }

  export async function listTurnSnapshots(
    params: ListTurnSnapshotsParams
  ): Promise<ListTurnSnapshotsResponse> {
    return await invoke<ListTurnSnapshotsResponse>('list_turn_snapshots', {
      params,
    });
  }

  export async function getRepoDiff(
    params: GetRepoDiffParams
  ): Promise<GetRepoDiffResponse> {
    return await invoke<GetRepoDiffResponse>('get_repo_diff', { params });
  }

  export async function getRepoFingerprint(
    params: GetRepoFingerprintParams
  ): Promise<GetRepoFingerprintResponse> {
    return await invoke<GetRepoFingerprintResponse>('get_repo_fingerprint', {
      params,
    });
  }

  export async function compactConversation(
    params: CompactConversationParams
  ): Promise<void> {
    return await invoke<void>('compact_conversation', { params });
  }

  export async function reviewMapConversation(
    params: ReviewMapConversationParams
  ): Promise<void> {
    return await invoke<void>('review_map_conversation', { params });
  }

  export async function handoffConversation(
    params: HandoffConversationParams
  ): Promise<HandoffConversationResponse> {
    return await invoke<HandoffConversationResponse>('handoff_conversation', {
      params,
    });
  }

  export async function interruptConversation(
    params: InterruptConversationParams
  ): Promise<InterruptConversationResponse> {
    return await invoke<InterruptConversationResponse>(
      'interrupt_conversation',
      { params }
    );
  }

  export async function getComposerConfig(
    params: GetComposerConfigParams
  ): Promise<ComposerTurnConfigPayload> {
    return await invoke<ComposerTurnConfigPayload>('get_composer_config', {
      params,
    });
  }

  export async function updateComposerConfig(
    params: UpdateComposerConfigParams
  ): Promise<void> {
    return await invoke<void>('update_composer_config', { params });
  }

  export async function addConversationListener(
    params: AddConversationListenerParams
  ): Promise<AddConversationSubscriptionResponse> {
    return await invoke<AddConversationSubscriptionResponse>(
      'add_conversation_listener',
      { params }
    );
  }

  export async function removeConversationListener(
    params: RemoveConversationListenerParams
  ): Promise<void> {
    return await invoke<void>('remove_conversation_listener', { params });
  }

  export async function respondApproval(
    params: RespondApprovalParams
  ): Promise<void> {
    return await invoke<void>('respond_approval', { params });
  }

  export async function getWorkspaceComposerDefaults(
    params: WorkspacePathParams
  ): Promise<WorkspaceSettings> {
    return await invoke<WorkspaceSettings>('get_workspace_composer_defaults', {
      params,
    });
  }

  export async function updateWorkspaceSettings(
    params: UpdateWorkspaceSettingsParams
  ): Promise<WorkspaceSettings> {
    return await invoke<WorkspaceSettings>('update_workspace_settings', {
      params,
    });
  }

  export async function searchWorkspaceFiles(
    params: SearchWorkspaceFilesParams
  ): Promise<Array<WorkspaceFileHit>> {
    return await invoke<Array<WorkspaceFileHit>>('search_workspace_files', {
      params,
    });
  }

  export async function searchWorkspaceSymbols(
    params: SearchWorkspaceSymbolsParams
  ): Promise<Array<WorkspaceSymbolHit>> {
    return await invoke<Array<WorkspaceSymbolHit>>('search_workspace_symbols', {
      params,
    });
  }

  export async function searchThreads(
    params: SearchThreadsParams
  ): Promise<SearchThreadsResponse> {
    return await invoke<SearchThreadsResponse>('search_threads', { params });
  }

  export async function createWorkspaceWindow(
    params: WorkspacePathParams
  ): Promise<void> {
    return await invoke<void>('create_workspace_window', { params });
  }

  export async function setWindowTitle(
    params: SetWindowTitleParams
  ): Promise<void> {
    return await invoke<void>('set_window_title', { params });
  }

  export async function getAuthState(): Promise<AuthState> {
    return await invoke<AuthState>('get_auth_state');
  }

  export async function checkForUpdate(): Promise<{
    version: string;
    current_version: string;
    body: string | null;
    date: string | null;
  } | null> {
    return await invoke<{
      version: string;
      current_version: string;
      body: string | null;
      date: string | null;
    } | null>('check_for_update');
  }

  export async function installUpdate(): Promise<void> {
    return await invoke<void>('install_update');
  }

  export namespace workspace {
    export async function listRecentWorkspaces(): Promise<Array<string>> {
      return await invoke<Array<string>>('list_recent_workspaces');
    }

    export async function openWorkspace(
      params: WorkspacePathParams
    ): Promise<string> {
      return await invoke<string>('open_workspace', { params });
    }

    export async function browseForWorkspace(): Promise<string | null> {
      return await invoke<string | null>('browse_for_workspace');
    }
  }
}
