use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Weak;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::Mutex;
use tokio::sync::oneshot;
use uuid::Uuid;

use codex_core::CodexConversation;

use crate::events::CodexEvent;
use crate::events::ConversationEventPayload;
use crate::workspace_manager::WorkspaceManager;
use codex_protocol::ConversationId;
use codex_protocol::protocol::Event;
use codex_protocol::protocol::EventMsg;

/// Manages active conversation event subscriptions
pub struct EventSubscriptionManager {
    /// Map of subscription ID to cancellation sender
    subscriptions: Arc<Mutex<HashMap<Uuid, oneshot::Sender<()>>>>,
    /// Map of conversation ID to subscription ID (prevents duplicate subscriptions)
    conversation_subscriptions: Arc<Mutex<HashMap<ConversationId, Uuid>>>,
    /// Map of subscription ID to target window label
    subscription_targets: Arc<Mutex<HashMap<Uuid, String>>>,
    /// Map of subscription ID to the conversation handle we are streaming from
    subscription_conversations: Arc<Mutex<HashMap<Uuid, Weak<CodexConversation>>>>,
}

impl EventSubscriptionManager {
    pub fn new() -> Self {
        Self {
            subscriptions: Arc::new(Mutex::new(HashMap::new())),
            conversation_subscriptions: Arc::new(Mutex::new(HashMap::new())),
            subscription_targets: Arc::new(Mutex::new(HashMap::new())),
            subscription_conversations: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Subscribe to events from a conversation
    /// Returns existing subscription ID if already subscribed
    pub async fn subscribe(
        &self,
        conversation_id: ConversationId,
        conversation: Arc<CodexConversation>,
        app_handle: AppHandle,
        window_label: String,
    ) -> Uuid {
        if let Some(existing_id) = {
            let conv_subs = self.conversation_subscriptions.lock().await;
            conv_subs.get(&conversation_id).copied()
        } {
            let same_window = {
                let targets = self.subscription_targets.lock().await;
                targets
                    .get(&existing_id)
                    .map(|target| target == &window_label)
                    .unwrap_or(false)
            };

            let same_conversation = {
                let handles = self.subscription_conversations.lock().await;
                handles
                    .get(&existing_id)
                    .and_then(|weak| weak.upgrade())
                    .map(|existing| Arc::ptr_eq(&existing, &conversation))
                    .unwrap_or(false)
            };

            if same_window && same_conversation {
                tracing::debug!(
                    "Conversation {} already has subscription {} for window {}",
                    conversation_id,
                    existing_id,
                    window_label
                );
                return existing_id;
            }

            tracing::info!(
                "Conversation {} replacing stale subscription {} (same_window={}, same_conversation={})",
                conversation_id,
                existing_id,
                same_window,
                same_conversation
            );

            let _ = self.unsubscribe(existing_id).await;
        }

        let subscription_id = Uuid::new_v4();
        tracing::info!(
            "Creating new subscription {} for conversation {}",
            subscription_id,
            conversation_id
        );
        let (cancel_tx, mut cancel_rx) = oneshot::channel();

        {
            let mut subs = self.subscriptions.lock().await;
            subs.insert(subscription_id, cancel_tx);

            let mut conv_subs = self.conversation_subscriptions.lock().await;
            conv_subs.insert(conversation_id, subscription_id);

            let mut targets = self.subscription_targets.lock().await;
            targets.insert(subscription_id, window_label.clone());

            let mut handles = self.subscription_conversations.lock().await;
            handles.insert(subscription_id, Arc::downgrade(&conversation));
        }

        let event_manager = self.clone_for_cleanup();
        let targets = self.subscription_targets.clone();
        let handles = self.subscription_conversations.clone();
        let target_label = window_label.clone();
        let conversation_id_for_task = conversation_id;

        tokio::spawn(async move {
            let conversation_id = conversation_id_for_task;
            loop {
                tokio::select! {
                    _ = &mut cancel_rx => {
                        tracing::info!(
                            "Subscription {} for conversation {} cancelled",
                            subscription_id,
                            conversation_id
                        );

                        let mut conv_subs = event_manager.conversation_subscriptions.lock().await;
                        conv_subs.remove(&conversation_id);
                        let mut targets = targets.lock().await;
                        targets.remove(&subscription_id);
                        let mut handles = handles.lock().await;
                        handles.remove(&subscription_id);
                        break;
                    }
                    event = conversation.next_event() => {
                        let event = match event {
                            Ok(event) => event,
                            Err(err) => {
                                tracing::warn!("conversation.next_event() failed: {}", err);
                                let mut targets = targets.lock().await;
                                targets.remove(&subscription_id);
                                let mut handles = handles.lock().await;
                                handles.remove(&subscription_id);
                                break;
                            }
                        };

                        let bridge_event = CodexEvent::ConversationEvent {
                            payload: ConversationEventPayload {
                                conversation_id: conversation_id.to_string(),
                                event_id: event.id.clone(),
                                event: event.msg.clone(),
                            },
                        };

                        tracing::debug!(
                            "Emitting event for conversation {}: {:?}",
                            conversation_id,
                            event.msg
                        );

                        if let Err(err) = app_handle.emit_to(&target_label, "codex-event", bridge_event) {
                            tracing::error!("Failed to emit event: {}", err);
                        }

                        handle_special_events(
                            event,
                            conversation_id,
                            app_handle.clone(),
                        )
                        .await;
                    }
                }
            }
        });

        subscription_id
    }

    fn clone_for_cleanup(&self) -> Self {
        Self {
            subscriptions: self.subscriptions.clone(),
            conversation_subscriptions: self.conversation_subscriptions.clone(),
            subscription_targets: self.subscription_targets.clone(),
            subscription_conversations: self.subscription_conversations.clone(),
        }
    }

    /// Unsubscribe from conversation events
    pub async fn unsubscribe(&self, subscription_id: Uuid) -> Result<(), String> {
        let sender = {
            let mut subs = self.subscriptions.lock().await;
            subs.remove(&subscription_id)
        };

        {
            let mut conv_subs = self.conversation_subscriptions.lock().await;
            conv_subs.retain(|_, &mut sub_id| sub_id != subscription_id);
        }

        {
            let mut targets = self.subscription_targets.lock().await;
            targets.remove(&subscription_id);
        }

        {
            let mut handles = self.subscription_conversations.lock().await;
            handles.remove(&subscription_id);
        }

        match sender {
            Some(sender) => {
                let _ = sender.send(());
                Ok(())
            }
            None => Err(format!("Subscription not found: {}", subscription_id)),
        }
    }
}

/// Handle special event types that require additional backend processing
async fn handle_special_events(
    event: Event,
    conversation_id: ConversationId,
    app_handle: AppHandle,
) {
    let Event { id: event_id, msg } = event;

    match msg {
        EventMsg::TurnDiff(_) => {
            let Some(workspace_state) = app_handle.try_state::<WorkspaceManager>() else {
                tracing::debug!("WorkspaceManager unavailable; skipping turn snapshot capture");
                return;
            };

            let workspace_manager: WorkspaceManager = workspace_state.inner().clone();
            let conversation_key = conversation_id.to_string();

            if let Some(session) = workspace_manager
                .get_active_conversation(&conversation_key)
                .await
            {
                let snapshots = session.review_snapshots();
                if let Err(err) = snapshots.ensure_base().await {
                    tracing::debug!(
                        "Failed to ensure baseline snapshot for conversation {}: {}",
                        conversation_id,
                        err
                    );
                    return;
                }

                if let Err(err) = snapshots.record_turn_snapshot(&event_id).await {
                    tracing::debug!(
                        "Failed to capture turn snapshot for conversation {}: {}",
                        conversation_id,
                        err
                    );
                }
            } else {
                tracing::debug!(
                    "No cached conversation session for {}; unable to capture snapshot",
                    conversation_key
                );
            }
        }
        _ => {
            // All other events (including approval requests) are handled by the frontend
            // through the normal event stream. No special backend processing needed.
        }
    }
}
