use std::sync::Arc;

use async_trait::async_trait;
use codex_protocol::items::TurnItem;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::AgentMessageContentDeltaEvent;
use codex_protocol::protocol::AgentMessageDeltaEvent;
use codex_protocol::protocol::Event;
use codex_protocol::protocol::EventMsg;
use codex_protocol::protocol::ExitedReviewMapModeEvent;
use codex_protocol::protocol::ItemCompletedEvent;
use codex_protocol::protocol::ReviewMapOutputEvent;
use tokio_util::sync::CancellationToken;
use tracing::info;
use tracing::trace;

use crate::codex::Session;
use crate::codex::TurnContext;
use crate::codex_delegate::run_codex_conversation_one_shot;
use crate::config::Config;
use crate::state::TaskKind;
use codex_protocol::user_input::UserInput;

use super::SessionTask;
use super::SessionTaskContext;

#[derive(Clone)]
pub(crate) struct ReviewMapTask {
    delegate_config: Config,
}

impl ReviewMapTask {
    pub(crate) fn new(delegate_config: Config) -> Self {
        Self { delegate_config }
    }
}

#[async_trait]
impl SessionTask for ReviewMapTask {
    fn kind(&self) -> TaskKind {
        TaskKind::ReviewMap
    }

    async fn run(
        self: Arc<Self>,
        session: Arc<SessionTaskContext>,
        ctx: Arc<TurnContext>,
        input: Vec<UserInput>,
        cancellation_token: CancellationToken,
    ) -> Option<String> {
        info!(sub_id = ctx.sub_id, "review-map task started");
        let delegate_config = self.delegate_config.clone();
        let output = match start_review_map_conversation(
            session.clone(),
            ctx.clone(),
            input,
            cancellation_token.clone(),
            delegate_config,
        )
        .await
        {
            Some(receiver) => {
                process_review_map_events(session.clone(), ctx.clone(), receiver).await
            }
            None => None,
        };

        info!(
            sub_id = ctx.sub_id,
            has_output = output.is_some(),
            cancelled = cancellation_token.is_cancelled(),
            "review-map task finished processing delegate events"
        );
        if !cancellation_token.is_cancelled() {
            exit_review_map_mode(session.clone_session(), output.clone(), ctx.clone()).await;
        }

        None
    }

    async fn abort(&self, session: Arc<SessionTaskContext>, ctx: Arc<TurnContext>) {
        info!(sub_id = ctx.sub_id, "review-map task abort requested");
        exit_review_map_mode(session.clone_session(), None, ctx).await;
    }
}

async fn start_review_map_conversation(
    session: Arc<SessionTaskContext>,
    ctx: Arc<TurnContext>,
    input: Vec<UserInput>,
    cancellation_token: CancellationToken,
    delegate_config: Config,
) -> Option<async_channel::Receiver<Event>> {
    info!(sub_id = ctx.sub_id, "starting review-map delegate");
    trace!(
        "Starting review-map conversation with config: {:#?}",
        delegate_config
    );

    (run_codex_conversation_one_shot(
        delegate_config,
        session.auth_manager(),
        session.models_manager(),
        input,
        session.clone_session(),
        ctx.clone(),
        cancellation_token,
        None,
    )
    .await)
        .ok()
        .map(|io| io.rx_event)
}

async fn process_review_map_events(
    session: Arc<SessionTaskContext>,
    ctx: Arc<TurnContext>,
    receiver: async_channel::Receiver<Event>,
) -> Option<ReviewMapOutputEvent> {
    let mut prev_agent_message: Option<Event> = None;
    while let Ok(event) = receiver.recv().await {
        match event.clone().msg {
            EventMsg::AgentMessage(_) => {
                if let Some(prev) = prev_agent_message.take() {
                    session
                        .clone_session()
                        .send_event(ctx.as_ref(), prev.msg)
                        .await;
                }
                prev_agent_message = Some(event);
            }
            // Suppress ItemCompleted only for assistant messages: forwarding it would trigger
            // legacy AgentMessage via as_legacy_events(), which this flow hides in favor of
            // structured output.
            EventMsg::ItemCompleted(ItemCompletedEvent {
                item: TurnItem::AgentMessage(_),
                ..
            })
            | EventMsg::AgentMessageDelta(AgentMessageDeltaEvent { .. })
            | EventMsg::AgentMessageContentDelta(AgentMessageContentDeltaEvent { .. }) => {}
            EventMsg::TaskComplete(task_complete) => {
                let out = task_complete
                    .last_agent_message
                    .as_deref()
                    .map(parse_review_map_output_event);
                info!(
                    sub_id = ctx.sub_id,
                    parsed_output = out.is_some(),
                    "review-map delegate task complete"
                );
                return out;
            }
            EventMsg::TurnAborted(_) => return None,
            other => {
                session
                    .clone_session()
                    .send_event(ctx.as_ref(), other)
                    .await;
            }
        }
    }
    None
}

fn parse_review_map_output_event(text: &str) -> ReviewMapOutputEvent {
    if let Ok(ev) = serde_json::from_str::<ReviewMapOutputEvent>(text) {
        return ev;
    }
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}'))
        && start < end
        && let Some(slice) = text.get(start..=end)
        && let Ok(ev) = serde_json::from_str::<ReviewMapOutputEvent>(slice)
    {
        return ev;
    }
    ReviewMapOutputEvent {
        summary: text.to_string(),
        ..Default::default()
    }
}

pub(crate) async fn exit_review_map_mode(
    session: Arc<Session>,
    review_map_output: Option<ReviewMapOutputEvent>,
    ctx: Arc<TurnContext>,
) {
    const REVIEW_MAP_USER_MESSAGE_ID: &str = "review_map:rollout:user";
    const REVIEW_MAP_ASSISTANT_MESSAGE_ID: &str = "review_map:rollout:assistant";

    let (user_message, assistant_message) = if let Some(out) = review_map_output.clone() {
        let user_message = format!("Review map complete ({title}).", title = out.title.trim());
        let assistant_message = if out.summary.trim().is_empty() {
            "Review map complete.".to_string()
        } else {
            out.summary.trim().to_string()
        };
        (user_message, assistant_message)
    } else {
        (
            "Review map was interrupted. Please re-run /review-map and wait for it to complete."
                .to_string(),
            "Review map was interrupted.".to_string(),
        )
    };

    session
        .record_conversation_items(
            &ctx,
            &[ResponseItem::Message {
                id: Some(REVIEW_MAP_USER_MESSAGE_ID.to_string()),
                role: "user".to_string(),
                content: vec![ContentItem::InputText { text: user_message }],
            }],
        )
        .await;

    session
        .send_event(
            ctx.as_ref(),
            EventMsg::ExitedReviewMapMode(ExitedReviewMapModeEvent { review_map_output }),
        )
        .await;

    info!(sub_id = ctx.sub_id, "emitted exited_review_map_mode");

    session
        .record_response_item_and_emit_turn_item(
            ctx.as_ref(),
            ResponseItem::Message {
                id: Some(REVIEW_MAP_ASSISTANT_MESSAGE_ID.to_string()),
                role: "assistant".to_string(),
                content: vec![ContentItem::OutputText {
                    text: assistant_message,
                }],
            },
        )
        .await;
}
