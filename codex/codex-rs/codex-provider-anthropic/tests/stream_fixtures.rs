use codex_api::common::ResponseEvent;
use codex_protocol::models::ResponseItem;
use serde_json::json;

#[test]
fn streams_text_thinking_and_tool_use_in_expected_order() {
    let events: Vec<(String, String)> = vec![
        (
            "message".to_string(),
            json!({ "type": "message_start", "message": { "id": "msg_1" } }).to_string(),
        ),
        (
            "message".to_string(),
            json!({
              "type": "content_block_start",
              "index": 0,
              "content_block": { "type": "text", "text": "" }
            })
            .to_string(),
        ),
        (
            "message".to_string(),
            json!({
              "type": "content_block_delta",
              "index": 0,
              "delta": { "type": "text_delta", "text": "Hello" }
            })
            .to_string(),
        ),
        (
            "message".to_string(),
            json!({
              "type": "content_block_start",
              "index": 2,
              "content_block": { "type": "thinking" }
            })
            .to_string(),
        ),
        (
            "message".to_string(),
            json!({
              "type": "content_block_delta",
              "index": 2,
              "delta": { "type": "thinking_delta", "thinking": "step" }
            })
            .to_string(),
        ),
        (
            "message".to_string(),
            json!({ "type": "content_block_stop", "index": 2 }).to_string(),
        ),
        (
            "message".to_string(),
            json!({
              "type": "content_block_start",
              "index": 1,
              "content_block": {
                "type": "tool_use",
                "id": "call_1",
                "name": "echo",
                "input": {}
              }
            })
            .to_string(),
        ),
        (
            "message".to_string(),
            json!({
              "type": "content_block_delta",
              "index": 1,
              "delta": { "type": "input_json_delta", "partial_json": "{\"text\":\"hi\"}" }
            })
            .to_string(),
        ),
        (
            "message".to_string(),
            json!({ "type": "content_block_stop", "index": 1 }).to_string(),
        ),
        (
            "message".to_string(),
            json!({ "type": "content_block_stop", "index": 0 }).to_string(),
        ),
        (
            "message".to_string(),
            json!({ "type": "message_stop" }).to_string(),
        ),
    ];

    let refs: Vec<(&str, &str)> = events
        .iter()
        .map(|(name, data)| (name.as_str(), data.as_str()))
        .collect();

    let output =
        codex_provider_anthropic::test_support::drive_wire_events(&refs).expect("drive events");

    assert!(matches!(output.first(), Some(ResponseEvent::Created)));
    assert!(
        output
            .iter()
            .any(|e| matches!(e, ResponseEvent::OutputTextDelta(d) if d == "Hello"))
    );
    assert!(output.iter().any(
        |e| matches!(e, ResponseEvent::ReasoningSummaryDelta { delta, .. } if delta == "step")
    ));
    assert!(output.iter().any(|e| matches!(
        e,
        ResponseEvent::OutputItemDone(ResponseItem::Reasoning { summary, .. })
        if summary.iter().any(|s| matches!(s, codex_protocol::models::ReasoningItemReasoningSummary::SummaryText { text } if text == "step"))
    )));
    assert!(output.iter().any(|e| matches!(
        e,
        ResponseEvent::OutputItemDone(ResponseItem::Reasoning { content: Some(content), .. })
        if content.iter().any(|c| matches!(c, codex_protocol::models::ReasoningItemContent::ReasoningText { text } if text == "step"))
    )));
    assert!(output.iter().any(|e| matches!(
        e,
        ResponseEvent::OutputItemDone(ResponseItem::FunctionCall { call_id, name, arguments, .. })
        if call_id == "call_1" && name == "echo" && arguments.contains("\"text\":\"hi\"")
    )));
    assert!(
        matches!(output.last(), Some(ResponseEvent::Completed { response_id, .. }) if response_id == "msg_1")
    );

    let mut saw_message_added = false;
    let mut saw_text_delta = false;
    for event in &output {
        match event {
            ResponseEvent::OutputItemAdded(ResponseItem::Message { role, .. }) => {
                if role == "assistant" {
                    saw_message_added = true;
                }
            }
            ResponseEvent::OutputTextDelta(_) => {
                saw_text_delta = true;
                assert!(
                    saw_message_added,
                    "text deltas must come after assistant item is added"
                );
            }
            _ => {}
        }
    }
    assert!(saw_text_delta);
}

#[test]
fn error_event_becomes_protocol_error() {
    let events: Vec<(String, String)> = vec![(
        "message".to_string(),
        json!({ "type": "error", "error": { "message": "nope" } }).to_string(),
    )];
    let refs: Vec<(&str, &str)> = events
        .iter()
        .map(|(name, data)| (name.as_str(), data.as_str()))
        .collect();

    let err = codex_provider_anthropic::test_support::drive_wire_events(&refs)
        .expect_err("expected error");
    let message = err.to_string();
    assert!(message.contains("nope"), "{message}");
}
