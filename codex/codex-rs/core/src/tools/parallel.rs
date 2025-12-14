use std::sync::Arc;
use std::time::Instant;

use tokio::sync::RwLock;
use tokio_util::either::Either;
use tokio_util::sync::CancellationToken;
use tokio_util::task::AbortOnDropHandle;

use crate::codex::Session;
use crate::codex::TurnContext;
use crate::error::CodexErr;
use crate::function_tool::FunctionCallError;
use crate::tools::TELEMETRY_PREVIEW_MAX_BYTES;
use crate::tools::TELEMETRY_PREVIEW_MAX_LINES;
use crate::tools::TELEMETRY_PREVIEW_TRUNCATION_NOTICE;
use crate::tools::context::SharedTurnDiffTracker;
use crate::tools::context::ToolPayload;
use crate::tools::router::ToolCall;
use crate::tools::router::ToolRouter;
use codex_protocol::models::FunctionCallOutputPayload;
use codex_protocol::models::ResponseInputItem;
use codex_utils_string::take_bytes_at_char_boundary;
use std::borrow::Cow;

#[derive(Clone)]
pub(crate) struct ToolCallRuntime {
    router: Arc<ToolRouter>,
    session: Arc<Session>,
    turn_context: Arc<TurnContext>,
    tracker: SharedTurnDiffTracker,
    parallel_execution: Arc<RwLock<()>>,
}

impl ToolCallRuntime {
    pub(crate) fn new(
        router: Arc<ToolRouter>,
        session: Arc<Session>,
        turn_context: Arc<TurnContext>,
        tracker: SharedTurnDiffTracker,
    ) -> Self {
        Self {
            router,
            session,
            turn_context,
            tracker,
            parallel_execution: Arc::new(RwLock::new(())),
        }
    }

    pub(crate) fn handle_tool_call(
        &self,
        call: ToolCall,
        cancellation_token: CancellationToken,
    ) -> impl std::future::Future<Output = Result<ResponseInputItem, CodexErr>> {
        let supports_parallel = self.router.tool_supports_parallel(&call.tool_name);

        let router = Arc::clone(&self.router);
        let session = Arc::clone(&self.session);
        let turn = Arc::clone(&self.turn_context);
        let tracker = Arc::clone(&self.tracker);
        let lock = Arc::clone(&self.parallel_execution);
        let started = Instant::now();

        let handle: AbortOnDropHandle<Result<ResponseInputItem, FunctionCallError>> =
            AbortOnDropHandle::new(tokio::spawn(async move {
                let maybe_tool_ref = generic_tool_ref_for_ui(&call);
                if let Some(tool) = maybe_tool_ref.clone() {
                    let msg = crate::protocol::EventMsg::ToolCallBegin(
                        crate::protocol::ToolCallBeginEvent {
                            call_id: call.call_id.clone(),
                            tool,
                            arguments_preview: preview_tool_arguments(&call.payload),
                        },
                    );
                    session.send_event(turn.as_ref(), msg).await;
                }

                enum Outcome {
                    Completed(Result<ResponseInputItem, FunctionCallError>),
                    Cancelled(ResponseInputItem),
                }

                let outcome = tokio::select! {
                    _ = cancellation_token.cancelled() => {
                        let secs = started.elapsed().as_secs_f32().max(0.1);
                        Outcome::Cancelled(Self::aborted_response(&call, secs))
                    },
                    res = async {
                        let _guard = if supports_parallel {
                            Either::Left(lock.read().await)
                        } else {
                            Either::Right(lock.write().await)
                        };

                        let dispatch_session = Arc::clone(&session);
                        let dispatch_turn = Arc::clone(&turn);
                        let dispatch_tracker = Arc::clone(&tracker);
                        router
                            .dispatch_tool_call(
                                dispatch_session,
                                dispatch_turn,
                                dispatch_tracker,
                                call.clone(),
                            )
                            .await
                    } => Outcome::Completed(res),
                };

                match outcome {
                    Outcome::Cancelled(response) => {
                        if let Some(tool) = maybe_tool_ref {
                            let msg = crate::protocol::EventMsg::ToolCallEnd(
                                crate::protocol::ToolCallEndEvent {
                                    call_id: call.call_id.clone(),
                                    tool,
                                    status: crate::protocol::ToolCallStatus::Cancelled,
                                    duration: started.elapsed(),
                                    output_preview: preview_response_output(&response),
                                    error_message: String::new(),
                                },
                            );
                            session.send_event(turn.as_ref(), msg).await;
                        }
                        Ok(response)
                    }
                    Outcome::Completed(result) => match result {
                        Ok(response) => {
                            if let Some(tool) = maybe_tool_ref {
                                let status = status_from_response(&response);
                                let msg = crate::protocol::EventMsg::ToolCallEnd(
                                    crate::protocol::ToolCallEndEvent {
                                        call_id: call.call_id.clone(),
                                        tool,
                                        status,
                                        duration: started.elapsed(),
                                        output_preview: preview_response_output(&response),
                                        error_message: String::new(),
                                    },
                                );
                                session.send_event(turn.as_ref(), msg).await;
                            }
                            Ok(response)
                        }
                        Err(err) => {
                            if let Some(tool) = maybe_tool_ref {
                                let msg = crate::protocol::EventMsg::ToolCallEnd(
                                    crate::protocol::ToolCallEndEvent {
                                        call_id: call.call_id.clone(),
                                        tool,
                                        status: crate::protocol::ToolCallStatus::Error,
                                        duration: started.elapsed(),
                                        output_preview: String::new(),
                                        error_message: preview_text(&err.to_string()),
                                    },
                                );
                                session.send_event(turn.as_ref(), msg).await;
                            }
                            Err(err)
                        }
                    },
                }
            }));

        async move {
            match handle.await {
                Ok(Ok(response)) => Ok(response),
                Ok(Err(FunctionCallError::Fatal(message))) => Err(CodexErr::Fatal(message)),
                Ok(Err(other)) => Err(CodexErr::Fatal(other.to_string())),
                Err(err) => Err(CodexErr::Fatal(format!(
                    "tool task failed to receive: {err:?}"
                ))),
            }
        }
    }
}

impl ToolCallRuntime {
    fn aborted_response(call: &ToolCall, secs: f32) -> ResponseInputItem {
        match &call.payload {
            ToolPayload::Custom { .. } => ResponseInputItem::CustomToolCallOutput {
                call_id: call.call_id.clone(),
                output: Self::abort_message(call, secs),
            },
            ToolPayload::Mcp { .. } => ResponseInputItem::McpToolCallOutput {
                call_id: call.call_id.clone(),
                result: Err(Self::abort_message(call, secs)),
            },
            _ => ResponseInputItem::FunctionCallOutput {
                call_id: call.call_id.clone(),
                output: FunctionCallOutputPayload {
                    content: Self::abort_message(call, secs),
                    ..Default::default()
                },
            },
        }
    }

    fn abort_message(call: &ToolCall, secs: f32) -> String {
        match call.tool_name.as_str() {
            "shell" | "container.exec" | "local_shell" | "shell_command" | "unified_exec" => {
                format!("Wall time: {secs:.1} seconds\naborted by user")
            }
            _ => format!("aborted by user after {secs:.1}s"),
        }
    }
}

fn generic_tool_ref_for_ui(call: &ToolCall) -> Option<crate::protocol::ToolRef> {
    if matches!(call.payload, ToolPayload::Mcp { .. }) {
        return None;
    }

    match call.tool_name.as_str() {
        // Tools with dedicated UI lifecycle events (avoid double-rendering).
        "shell"
        | "shell_command"
        | "container.exec"
        | "local_shell"
        | "unified_exec"
        | "exec_command"
        | "write_stdin"
        | "view_image"
        | "read_thread"
        | "update_plan"
        | "apply_patch"
        | "list_mcp_resources"
        | "list_mcp_resource_templates"
        | "read_mcp_resource" => None,
        "read_file" => Some(crate::protocol::ToolRef::Builtin {
            name: crate::protocol::BuiltinToolName::ReadFile,
        }),
        "list_dir" => Some(crate::protocol::ToolRef::Builtin {
            name: crate::protocol::BuiltinToolName::ListDir,
        }),
        "grep_files" => Some(crate::protocol::ToolRef::Builtin {
            name: crate::protocol::BuiltinToolName::GrepFiles,
        }),
        _ => None,
    }
}

fn preview_tool_arguments(payload: &ToolPayload) -> String {
    let raw: Cow<'_, str> = match payload {
        ToolPayload::Function { arguments } => Cow::Borrowed(arguments),
        ToolPayload::Custom { input } => Cow::Borrowed(input),
        ToolPayload::LocalShell { params } => Cow::Owned(params.command.join(" ")),
        ToolPayload::UnifiedExec { arguments } => Cow::Borrowed(arguments),
        ToolPayload::Mcp {
            server,
            tool,
            raw_arguments,
        } => Cow::Owned(format!("{server}.{tool} {raw_arguments}")),
    };
    preview_text(raw.as_ref())
}

fn preview_response_output(response: &ResponseInputItem) -> String {
    match response {
        ResponseInputItem::FunctionCallOutput { output, .. } => preview_text(&output.content),
        ResponseInputItem::CustomToolCallOutput { output, .. } => preview_text(output),
        ResponseInputItem::McpToolCallOutput { result, .. } => preview_text(&format!("{result:?}")),
        _ => String::new(),
    }
}

fn status_from_response(response: &ResponseInputItem) -> crate::protocol::ToolCallStatus {
    match response {
        ResponseInputItem::FunctionCallOutput { output, .. } => {
            if output.success == Some(false) {
                crate::protocol::ToolCallStatus::Error
            } else {
                crate::protocol::ToolCallStatus::Ok
            }
        }
        _ => crate::protocol::ToolCallStatus::Ok,
    }
}

fn preview_text(content: &str) -> String {
    let truncated_slice = take_bytes_at_char_boundary(content, TELEMETRY_PREVIEW_MAX_BYTES);
    let truncated_by_bytes = truncated_slice.len() < content.len();

    let mut preview = String::new();
    let mut lines_iter = truncated_slice.lines();
    for idx in 0..TELEMETRY_PREVIEW_MAX_LINES {
        match lines_iter.next() {
            Some(line) => {
                if idx > 0 {
                    preview.push('\n');
                }
                preview.push_str(line);
            }
            None => break,
        }
    }
    let truncated_by_lines = lines_iter.next().is_some();

    if !truncated_by_bytes && !truncated_by_lines {
        return content.to_string();
    }

    if !preview.is_empty() && !preview.ends_with('\n') {
        preview.push('\n');
    }
    preview.push_str(TELEMETRY_PREVIEW_TRUNCATION_NOTICE);
    preview
}
