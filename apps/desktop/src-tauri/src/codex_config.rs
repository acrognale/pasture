use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;

use codex_core::config::Config;
use codex_core::config::ConfigOverrides;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;
use serde_json::Value;

use crate::domain::WorkspaceSettings;
use crate::errors::AppError;
use crate::errors::AppResult;

/// Options provided when starting or forking a new thread.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct NewThreadOptions {
    pub model: Option<String>,
    pub profile: Option<String>,
    pub cwd: Option<String>,
    pub approval_policy: Option<AskForApproval>,
    pub sandbox: Option<SandboxMode>,
    pub config: Option<HashMap<String, Value>>,
    pub base_instructions: Option<String>,
    pub include_apply_patch_tool: Option<bool>,
    pub web_search_enabled: Option<bool>,
}

impl NewThreadOptions {
    fn cli_overrides(&self) -> Vec<(String, toml::Value)> {
        match &self.config {
            Some(config) => config
                .iter()
                .map(|(k, v)| (k.clone(), json_to_toml(v.clone())))
                .collect(),
            None => Vec::new(),
        }
    }
}

/// Derive a Codex `Config` by merging base config, workspace settings, and thread options.
pub async fn derive_config(
    base_config: &Config,
    settings: &WorkspaceSettings,
    options: &NewThreadOptions,
) -> AppResult<Config> {
    let mut overrides = ConfigOverrides {
        model: options.model.clone().or_else(|| settings.model.clone()),
        config_profile: options.profile.clone(),
        approval_policy: options.approval_policy.or(settings.approval),
        sandbox_mode: options.sandbox.or(settings.sandbox),
        base_instructions: options.base_instructions.clone(),
        include_apply_patch_tool: options.include_apply_patch_tool,
        tools_web_search_request: options.web_search_enabled.or(settings.web_search_enabled),
        ..ConfigOverrides::default()
    };

    let resolved_cwd = options
        .cwd
        .as_ref()
        .map(Path::new)
        .map(|path| {
            if path.is_absolute() {
                PathBuf::from(path)
            } else {
                base_config.cwd.join(path)
            }
        })
        .unwrap_or_else(|| base_config.cwd.clone());

    overrides.cwd = Some(resolved_cwd.clone());

    let cli_overrides = options.cli_overrides();

    let mut config = Config::load_with_cli_overrides_and_harness_overrides(
        cli_overrides,
        overrides,
    )
        .await
        .map_err(|e| AppError::Codex(format!("Failed to load config: {}", e)))?;

    config.cwd = resolved_cwd;
    config.shell_environment_policy = base_config.shell_environment_policy.clone();

    if let Some(reasoning_effort) = settings.reasoning_effort {
        config.model_reasoning_effort = Some(reasoning_effort);
    }
    if let Some(reasoning_summary) = settings.reasoning_summary {
        config.model_reasoning_summary = reasoning_summary;
    }

    Ok(config)
}

fn json_to_toml(value: Value) -> toml::Value {
    match value {
        Value::Null => toml::Value::String(String::new()),
        Value::Bool(b) => toml::Value::Boolean(b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                toml::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                toml::Value::Float(f)
            } else {
                toml::Value::String(n.to_string())
            }
        }
        Value::String(s) => toml::Value::String(s),
        Value::Array(arr) => toml::Value::Array(arr.into_iter().map(json_to_toml).collect()),
        Value::Object(obj) => {
            let mut map = toml::value::Table::new();
            for (k, v) in obj {
                map.insert(k, json_to_toml(v));
            }
            toml::Value::Table(map)
        }
    }
}
