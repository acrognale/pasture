use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Weak;

use chrono::Utc;
use codex_core::CodexConversation;
use codex_protocol::ConversationId;
use codex_protocol::protocol::Event;
use codex_protocol::protocol::EventMsg;
use codex_protocol::protocol::HandoffPlanEvent;
use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::Mutex;
use tokio::sync::oneshot;
use tokio::time::Duration;
use ts_rs::TS;
use uuid::Uuid;

use crate::auth::AuthState;
use crate::review;
use crate::state::AppState;
use crate::threads;

/// Payload emitted over the shared codex event channel.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConversationEventPayload {
    pub conversation_id: String,
    pub turn_id: String,
    pub event_id: String,
    pub event: EventMsg,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMetadataPayload {
    pub thread_id: String,
    pub conversation_id: String,
    pub workspace_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    pub timestamp: String,
}

/// Union of events emitted to the renderer.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CodexEvent {
    #[serde(rename = "conversation-event")]
    ConversationEvent {
        payload: Box<ConversationEventPayload>,
    },
    #[serde(rename = "auth-updated")]
    AuthUpdated { payload: AuthState },
    #[serde(rename = "thread-metadata-updated")]
    ThreadMetadataUpdated { payload: ThreadMetadataPayload },
}

#[derive(Debug)]
pub struct Subscription {
    pub cancel_tx: oneshot::Sender<()>,
    pub conversation_id: ConversationId,
    pub window_label: String,
    pub conversation: Weak<CodexConversation>,
}

#[derive(Clone, Default)]
pub struct EventRouter {
    by_id: Arc<Mutex<HashMap<Uuid, Subscription>>>,
    by_conversation: Arc<Mutex<HashMap<ConversationId, Uuid>>>,
    handoff_waiters: Arc<Mutex<HashMap<ConversationId, Vec<oneshot::Sender<HandoffPlanEvent>>>>>,
}

impl EventRouter {
    pub fn new() -> Self {
        Self {
            by_id: Arc::new(Mutex::new(HashMap::new())),
            by_conversation: Arc::new(Mutex::new(HashMap::new())),
            handoff_waiters: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn ensure_subscription(
        &self,
        conversation_id: ConversationId,
        conversation: Arc<CodexConversation>,
        app_handle: AppHandle,
        window_label: String,
    ) -> Uuid {
        if let Some(existing_id) = {
            self.by_conversation
                .lock()
                .await
                .get(&conversation_id)
                .cloned()
        } {
            let should_reuse = {
                let by_id = self.by_id.lock().await;
                by_id.get(&existing_id).is_some_and(|subscription| {
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
                    conversation_id,
                    existing_id,
                    window_label
                );
                return existing_id;
            }

            tracing::info!(
                "Replacing stale subscription {} for fork {} (window={})",
                existing_id,
                conversation_id,
                window_label
            );
            let _ = self.unsubscribe(existing_id).await;
        }

        self.subscribe(conversation_id, conversation, app_handle, window_label)
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
                    let mut by_fork = self.by_conversation.lock().await;
                    by_fork.remove(&subscription.conversation_id);
                }
                let _ = subscription.cancel_tx.send(());
                Ok(())
            }
            None => Err(format!("Subscription not found: {}", subscription_id)),
        }
    }

    pub async fn wait_for_handoff_plan(
        &self,
        conversation_id: &ConversationId,
    ) -> Result<HandoffPlanEvent, String> {
        let (tx, rx) = oneshot::channel();
        {
            let mut waiters = self.handoff_waiters.lock().await;
            waiters.entry(*conversation_id).or_default().push(tx);
        }

        match tokio::time::timeout(Duration::from_secs(60), rx).await {
            Ok(Ok(event)) => Ok(event),
            Ok(Err(_)) => Err("handoff waiter cancelled".to_string()),
            Err(_) => {
                let mut waiters = self.handoff_waiters.lock().await;
                if let Some(list) = waiters.get_mut(conversation_id) {
                    list.retain(|sender| !sender.is_closed());
                    if list.is_empty() {
                        waiters.remove(conversation_id);
                    }
                }
                Err("Timed out waiting for handoff plan".to_string())
            }
        }
    }

    async fn subscribe(
        &self,
        conversation_id: ConversationId,
        conversation: Arc<CodexConversation>,
        app_handle: AppHandle,
        window_label: String,
    ) -> Uuid {
        let subscription_id = Uuid::new_v4();
        let (cancel_tx, mut cancel_rx) = oneshot::channel();
        let subscription = Subscription {
            cancel_tx,
            conversation_id,
            window_label: window_label.clone(),
            conversation: Arc::downgrade(&conversation),
        };

        {
            let mut by_id = self.by_id.lock().await;
            by_id.insert(subscription_id, subscription);
        }

        {
            let mut by_fork = self.by_conversation.lock().await;
            by_fork.insert(conversation_id, subscription_id);
        }

        let router = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut cancel_rx => {
                        tracing::info!(
                            "Subscription {} for fork {} cancelled",
                            subscription_id,
                            conversation_id
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
                                    conversation_id,
                                    subscription_id,
                                    err
                                );
                                router.cleanup_subscription(&subscription_id).await;
                                break;
                            }
                        };

                        let bridge_event = CodexEvent::ConversationEvent {
                            payload: Box::new(ConversationEventPayload {
                                conversation_id: conversation_id.to_string(),
                                turn_id: event.id.clone(),
                                event_id: Uuid::new_v4().to_string(),
                                event: event.msg.clone(),
                                timestamp: Utc::now().to_rfc3339(),
                            }),
                        };

                        tracing::debug!(
                            "Emitting event for fork {}: {:?}",
                            conversation_id,
                            event.msg
                        );

                        if let Err(err) = app_handle.emit_to(&window_label, "codex-event", bridge_event) {
                            tracing::error!("Failed to emit event: {}", err);
                        }

                        router
                            .notify_handoff_waiters(&conversation_id, &event.msg)
                            .await;

                        router
                            .handle_special_events(&conversation_id, &event, &app_handle)
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
            let mut by_fork = self.by_conversation.lock().await;
            by_fork.remove(&subscription.conversation_id);
        } else {
            let mut by_fork = self.by_conversation.lock().await;
            by_fork.retain(|_, id| id != subscription_id);
        }
    }

    async fn notify_handoff_waiters(&self, conversation_id: &ConversationId, event: &EventMsg) {
        if let EventMsg::HandoffPlan(plan) = event {
            let mut waiters = self.handoff_waiters.lock().await;
            if let Some(list) = waiters.get_mut(conversation_id) {
                if let Some(sender) = list.pop() {
                    let _ = sender.send(plan.clone());
                }
                if list.is_empty() {
                    waiters.remove(conversation_id);
                }
            }
        }
    }

    async fn handle_special_events(
        &self,
        conversation_id: &ConversationId,
        event: &Event,
        app_handle: &AppHandle,
    ) {
        match &event.msg {
            // Treat these as "turn finished" moments and trigger a background index refresh.
            EventMsg::TaskComplete(_) | EventMsg::TurnAborted(_) => {
                let Some(app_state) = app_handle.try_state::<AppState>() else {
                    return;
                };
                match threads::workspace_path_for_conversation(&app_state.db, conversation_id).await
                {
                    Ok(Some(workspace_path)) => {
                        if let Err(err) = app_state
                            .thread_search
                            .ensure_indexing_started(app_state.db.clone(), workspace_path.clone())
                            .await
                        {
                            tracing::debug!(
                                "Failed to start thread search indexing for workspace {}: {}",
                                workspace_path.as_str(),
                                err
                            );
                        }
                    }
                    Ok(None) => {}
                    Err(err) => {
                        tracing::debug!(
                            "Failed to resolve workspace for conversation {}: {}",
                            conversation_id,
                            err
                        );
                    }
                }
            }
            _ => {}
        }

        if let EventMsg::TurnDiff(_) = &event.msg {
            let Some(app_state) = app_handle.try_state::<AppState>() else {
                tracing::debug!("AppState unavailable; skipping turn snapshot capture");
                return;
            };
            if let Err(err) = review::ensure_base(&app_state.db, conversation_id).await {
                tracing::debug!(
                    "Failed to ensure baseline snapshot for fork {}: {}",
                    conversation_id,
                    err
                );
                return;
            }

            if let Err(err) =
                review::record_turn_snapshot(&app_state.db, conversation_id, &event.id).await
            {
                tracing::debug!(
                    "Failed to capture turn snapshot for fork {}: {}",
                    conversation_id,
                    err
                );
            }
        }
    }
}
