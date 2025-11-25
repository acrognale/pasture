use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Weak;

use chrono::Utc;
use codex_core::CodexConversation;
use codex_protocol::protocol::Event;
use codex_protocol::protocol::EventMsg;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::Mutex;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::domain::ForkId;
use crate::events::CodexEvent;
use crate::events::ConversationEventPayload;
use crate::services::ReviewService;
use crate::workspace_manager::WorkspaceManager;

#[derive(Debug)]
pub struct Subscription {
    pub cancel_tx: oneshot::Sender<()>,
    pub fork_id: ForkId,
    pub window_label: String,
    pub conversation: Weak<CodexConversation>,
}

#[derive(Clone, Default)]
pub struct EventRouter {
    by_id: Arc<Mutex<HashMap<Uuid, Subscription>>>,
    by_fork: Arc<Mutex<HashMap<ForkId, Uuid>>>,
}

impl EventRouter {
    pub fn new() -> Self {
        Self {
            by_id: Arc::new(Mutex::new(HashMap::new())),
            by_fork: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn ensure_subscription(
        &self,
        fork_id: ForkId,
        conversation: Arc<CodexConversation>,
        app_handle: AppHandle,
        window_label: String,
    ) -> Uuid {
        if let Some(existing_id) = { self.by_fork.lock().await.get(&fork_id).cloned() } {
            let should_reuse = {
                let by_id = self.by_id.lock().await;
                by_id.get(&existing_id).map_or(false, |subscription| {
                    let same_window = subscription.window_label == window_label;
                    let same_conversation = subscription
                        .conversation
                        .upgrade()
                        .map(|existing| Arc::ptr_eq(&existing, &conversation))
                        .unwrap_or(false);
                    same_window && same_conversation
                })
            };

            if should_reuse {
                tracing::debug!(
                    "Fork {} already subscribed via {}; window={}",
                    fork_id,
                    existing_id,
                    window_label
                );
                return existing_id;
            }

            tracing::info!(
                "Replacing stale subscription {} for fork {} (window={})",
                existing_id,
                fork_id,
                window_label
            );
            let _ = self.unsubscribe(existing_id).await;
        }

        self.subscribe(fork_id, conversation, app_handle, window_label)
            .await
    }

    pub async fn unsubscribe(&self, subscription_id: Uuid) -> Result<(), String> {
        let removed = {
            let mut by_id = self.by_id.lock().await;
            by_id.remove(&subscription_id)
        };

        match removed {
            Some(subscription) => {
                {
                    let mut by_fork = self.by_fork.lock().await;
                    by_fork.remove(&subscription.fork_id);
                }
                let _ = subscription.cancel_tx.send(());
                Ok(())
            }
            None => Err(format!("Subscription not found: {}", subscription_id)),
        }
    }

    async fn subscribe(
        &self,
        fork_id: ForkId,
        conversation: Arc<CodexConversation>,
        app_handle: AppHandle,
        window_label: String,
    ) -> Uuid {
        let subscription_id = Uuid::new_v4();
        let (cancel_tx, mut cancel_rx) = oneshot::channel();
        let subscription = Subscription {
            cancel_tx,
            fork_id: fork_id.clone(),
            window_label: window_label.clone(),
            conversation: Arc::downgrade(&conversation),
        };

        {
            let mut by_id = self.by_id.lock().await;
            by_id.insert(subscription_id, subscription);
        }

        {
            let mut by_fork = self.by_fork.lock().await;
            by_fork.insert(fork_id.clone(), subscription_id);
        }

        let router = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut cancel_rx => {
                        tracing::info!(
                            "Subscription {} for fork {} cancelled",
                            subscription_id,
                            fork_id
                        );
                        router.cleanup_subscription(&subscription_id).await;
                        break;
                    }
                    event = conversation.next_event() => {
                        let event = match event {
                            Ok(event) => event,
                            Err(err) => {
                                tracing::warn!(
                                    "next_event failed for fork {} ({}): {}",
                                    fork_id,
                                    subscription_id,
                                    err
                                );
                                router.cleanup_subscription(&subscription_id).await;
                                break;
                            }
                        };

                        let bridge_event = CodexEvent::ConversationEvent {
                            payload: ConversationEventPayload {
                                conversation_id: fork_id.to_string(),
                                turn_id: event.id.clone(),
                                event_id: Uuid::new_v4().to_string(),
                                event: event.msg.clone(),
                                timestamp: Utc::now().to_rfc3339(),
                            },
                        };

                        tracing::debug!(
                            "Emitting event for fork {}: {:?}",
                            fork_id,
                            event.msg
                        );

                        if let Err(err) = app_handle.emit_to(&window_label, "codex-event", bridge_event) {
                            tracing::error!("Failed to emit event: {}", err);
                        }

                        router
                            .handle_special_events(&fork_id, &event, &app_handle)
                            .await;
                    }
                }
            }
        });

        subscription_id
    }

    async fn cleanup_subscription(&self, subscription_id: &Uuid) {
        if let Some(subscription) = {
            let mut by_id = self.by_id.lock().await;
            by_id.remove(subscription_id)
        } {
            let mut by_fork = self.by_fork.lock().await;
            by_fork.remove(&subscription.fork_id);
        } else {
            let mut by_fork = self.by_fork.lock().await;
            by_fork.retain(|_, id| id != subscription_id);
        }
    }

    async fn handle_special_events(&self, fork_id: &ForkId, event: &Event, app_handle: &AppHandle) {
        if let EventMsg::TurnDiff(_) = &event.msg {
            let Some(review_state) = app_handle.try_state::<Arc<ReviewService>>() else {
                tracing::debug!("ReviewService unavailable; skipping turn snapshot capture");
                return;
            };
            let review_service: Arc<ReviewService> = review_state.inner().clone();
            let Some(workspace_state) = app_handle.try_state::<WorkspaceManager>() else {
                tracing::debug!("WorkspaceManager unavailable; skipping turn snapshot capture");
                return;
            };

            let workspace_manager: WorkspaceManager = workspace_state.inner().clone();
            let conversation_key = fork_id.to_string();

            if let Some(session) = workspace_manager
                .get_active_conversation(&conversation_key)
                .await
            {
                let cwd = session.cwd.clone();
                if let Err(err) = review_service.ensure_base(fork_id, cwd.as_path()).await {
                    tracing::debug!(
                        "Failed to ensure baseline snapshot for fork {}: {}",
                        fork_id,
                        err
                    );
                    return;
                }

                if let Err(err) = review_service
                    .record_turn_snapshot(fork_id, &event.id, cwd.as_path())
                    .await
                {
                    tracing::debug!(
                        "Failed to capture turn snapshot for fork {}: {}",
                        fork_id,
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
    }
}
