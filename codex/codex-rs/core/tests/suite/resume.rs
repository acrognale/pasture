use anyhow::Result;
use codex_core::protocol::EventMsg;
use codex_core::protocol::Op;
use codex_protocol::user_input::UserInput;
use core_test_support::responses::ev_assistant_message;
use core_test_support::responses::ev_completed;
use core_test_support::responses::ev_reasoning_item;
use core_test_support::responses::ev_response_created;
use core_test_support::responses::mount_sse_once;
use core_test_support::responses::sse;
use core_test_support::responses::start_mock_server;
use core_test_support::skip_if_no_network;
use core_test_support::test_codex::test_codex;
use core_test_support::wait_for_event;
use std::sync::Arc;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn resume_includes_initial_messages_from_rollout_events() -> Result<()> {
    skip_if_no_network!(Ok(()));

    let server = start_mock_server().await;
    let mut builder = test_codex();
    let initial = builder.build(&server).await?;
    let codex = Arc::clone(&initial.codex);
    let home = initial.home.clone();
    let rollout_path = initial.session_configured.rollout_path.clone();

    let initial_sse = sse(vec![
        ev_response_created("resp-initial"),
        ev_assistant_message("msg-1", "Completed first turn"),
        ev_completed("resp-initial"),
    ]);
    mount_sse_once(&server, initial_sse).await;

    codex
        .submit(Op::UserInput {
            items: vec![UserInput::Text {
                text: "Record some messages".into(),
            }],
        })
        .await?;

    wait_for_event(&codex, |event| matches!(event, EventMsg::TaskComplete(_))).await;

    let resumed = builder.resume(&server, home, rollout_path).await?;
    let initial_messages = resumed
        .session_configured
        .initial_messages
        .expect("expected initial messages to be present for resumed session");
    let user_idx = initial_messages.iter().position(|ev| {
        matches!(
            ev,
            EventMsg::UserMessage(user) if user.message == "Record some messages"
        )
    });
    let assistant_idx = initial_messages.iter().position(|ev| {
        matches!(
            ev,
            EventMsg::AgentMessage(msg) if msg.message == "Completed first turn"
        )
    });
    assert!(user_idx.is_some(), "missing expected initial user message");
    assert!(
        assistant_idx.is_some(),
        "missing expected initial assistant message"
    );
    assert!(
        user_idx.unwrap() < assistant_idx.unwrap(),
        "expected user message to precede assistant message"
    );

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn resume_includes_initial_messages_from_reasoning_events() -> Result<()> {
    skip_if_no_network!(Ok(()));

    let server = start_mock_server().await;
    let mut builder = test_codex().with_config(|config| {
        config.show_raw_agent_reasoning = true;
    });
    let initial = builder.build(&server).await?;
    let codex = Arc::clone(&initial.codex);
    let home = initial.home.clone();
    let rollout_path = initial.session_configured.rollout_path.clone();

    let initial_sse = sse(vec![
        ev_response_created("resp-initial"),
        ev_reasoning_item("reason-1", &["Summarized step"], &["raw detail"]),
        ev_assistant_message("msg-1", "Completed reasoning turn"),
        ev_completed("resp-initial"),
    ]);
    mount_sse_once(&server, initial_sse).await;

    codex
        .submit(Op::UserInput {
            items: vec![UserInput::Text {
                text: "Record reasoning messages".into(),
            }],
        })
        .await?;

    wait_for_event(&codex, |event| matches!(event, EventMsg::TaskComplete(_))).await;

    let resumed = builder.resume(&server, home, rollout_path).await?;
    let initial_messages = resumed
        .session_configured
        .initial_messages
        .expect("expected initial messages to be present for resumed session");
    let user_idx = initial_messages.iter().position(|ev| {
        matches!(
            ev,
            EventMsg::UserMessage(user) if user.message == "Record reasoning messages"
        )
    });
    let reasoning_idx = initial_messages.iter().position(|ev| {
        matches!(
            ev,
            EventMsg::AgentReasoning(reason) if reason.text == "Summarized step"
        )
    });
    let raw_idx = initial_messages.iter().position(|ev| {
        matches!(
            ev,
            EventMsg::AgentReasoningRawContent(raw) if raw.text == "raw detail"
        )
    });
    let assistant_idx = initial_messages.iter().position(|ev| {
        matches!(
            ev,
            EventMsg::AgentMessage(msg) if msg.message == "Completed reasoning turn"
        )
    });

    assert!(user_idx.is_some(), "missing expected initial user message");
    assert!(
        reasoning_idx.is_some(),
        "missing expected reasoning summary"
    );
    assert!(raw_idx.is_some(), "missing expected reasoning raw content");
    assert!(
        assistant_idx.is_some(),
        "missing expected initial assistant message"
    );

    let user_idx = user_idx.unwrap();
    let reasoning_idx = reasoning_idx.unwrap();
    let raw_idx = raw_idx.unwrap();
    let assistant_idx = assistant_idx.unwrap();
    assert!(
        user_idx < reasoning_idx && reasoning_idx < raw_idx && raw_idx < assistant_idx,
        "expected ordering: user < reasoning < raw < assistant"
    );

    Ok(())
}
