pub fn infer_model_provider_id(model: &str) -> Option<&'static str> {
    let normalized = model.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }

    if normalized.starts_with("claude-") || normalized.starts_with("anthropic/claude-") {
        return Some("anthropic");
    }

    if normalized.starts_with("gpt-") || normalized.starts_with("codex-") {
        return Some("openai");
    }

    None
}
