use crate::config::Config;
use crate::features::Feature;
use crate::protocol::SandboxPolicy;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::protocol::AskForApproval;

pub(crate) fn build_review_map_delegate_config(parent_config: &Config) -> Config {
    let mut sub_agent_config = parent_config.clone();

    // Review-map is a read-only analysis workflow; don't allow writes.
    sub_agent_config.sandbox_policy = SandboxPolicy::DangerFullAccess;
    sub_agent_config.approval_policy = AskForApproval::Never;

    // Run with only the review-map rubric — drop outer user_instructions.
    sub_agent_config.user_instructions = None;

    // Avoid loading project docs; the map should be based on the diff and targeted reads.
    sub_agent_config.project_doc_max_bytes = 0;

    // Carry over review-only feature restrictions so the delegate cannot re-enable blocked tools.
    sub_agent_config
        .features
        .disable(Feature::WebSearchRequest)
        .disable(Feature::ViewImageTool);

    // Set explicit rubric for the sub-agent.
    sub_agent_config.developer_instructions = Some(crate::REVIEW_MAP_PROMPT.to_string());

    // Reuse the configured review model for review-map tasks.
    sub_agent_config.model = Some(parent_config.review_model.clone());

    // Match the review-map turn defaults that were previously inherited from the parent TurnContext.
    sub_agent_config.model_reasoning_effort = Some(ReasoningEffort::Low);
    sub_agent_config.model_reasoning_summary = ReasoningSummary::Detailed;

    sub_agent_config
}
