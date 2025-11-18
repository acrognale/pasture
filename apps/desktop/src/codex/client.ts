// GENERATED CODE! DO NOT MODIFY BY HAND!
import { invoke } from '@tauri-apps/api/core';
import type {
  AddConversationListenerParams,
  AddConversationSubscriptionResponse,
  AuthState,
  CompactConversationParams,
  ComposerTurnConfigPayload,
  GetComposerConfigParams,
  GetTurnDiffRangeParams,
  GetTurnDiffRangeResponse,
  InitializeConversationParams,
  InitializeConversationResponse,
  InitializeResponse,
  InterruptConversationParams,
  InterruptConversationResponse,
  ListConversationsParams,
  ListConversationsResponse,
  ListTurnSnapshotsParams,
  ListTurnSnapshotsResponse,
  NewConversationCommandParams,
  NewConversationResponse,
  RemoveConversationListenerParams,
  RespondApprovalParams,
  SendUserMessageParams,
  SetWindowTitleParams,
  UpdateComposerConfigParams,
  WorkspaceComposerDefaults,
  WorkspacePathParams,
} from '~/codex.gen';

export namespace Codex {
  export async function initialize(): Promise<InitializeResponse> {
    return await invoke<InitializeResponse>('initialize');
  }

  export async function listConversations(
    params: ListConversationsParams
  ): Promise<ListConversationsResponse> {
    return await invoke<ListConversationsResponse>('list_conversations', {
      params,
    });
  }

  export async function initializeConversation(
    params: InitializeConversationParams
  ): Promise<InitializeConversationResponse> {
    return await invoke<InitializeConversationResponse>(
      'initialize_conversation',
      { params }
    );
  }

  export async function newConversation(
    params: NewConversationCommandParams
  ): Promise<NewConversationResponse> {
    return await invoke<NewConversationResponse>('new_conversation', {
      params,
    });
  }

  export async function sendUserMessage(
    params: SendUserMessageParams
  ): Promise<void> {
    return await invoke<void>('send_user_message', { params });
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

  export async function compactConversation(
    params: CompactConversationParams
  ): Promise<void> {
    return await invoke<void>('compact_conversation', { params });
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
  ): Promise<WorkspaceComposerDefaults> {
    return await invoke<WorkspaceComposerDefaults>(
      'get_workspace_composer_defaults',
      { params }
    );
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
