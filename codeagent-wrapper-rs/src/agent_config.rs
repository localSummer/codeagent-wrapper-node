//! Agent configuration and preset loading

#![allow(dead_code)]

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Agent configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Agent name
    pub name: String,
    /// Model to use
    #[serde(default)]
    pub model: Option<String>,
    /// Backend to use
    #[serde(default)]
    pub backend: Option<String>,
    /// Skip permissions
    #[serde(default, rename = "skipPermissions")]
    pub skip_permissions: bool,
    /// Additional environment variables
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Prompt prefix
    #[serde(default, rename = "promptPrefix")]
    pub prompt_prefix: Option<String>,
}

/// Models configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelsConfig {
    /// Available models by backend
    #[serde(default)]
    pub models: HashMap<String, Vec<ModelInfo>>,
}

/// Model information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    /// Model name/ID
    pub name: String,
    /// Display name
    #[serde(default)]
    pub display: Option<String>,
    /// Model capabilities
    #[serde(default)]
    pub capabilities: Vec<String>,
}

/// Get config directory path
fn get_config_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".codeagent")
}

/// Load agent configuration by name
pub async fn get_agent_config(name: &str) -> Result<AgentConfig> {
    let config_dir = get_config_dir();
    let agents_file = config_dir.join("agents.yaml");

    if !agents_file.exists() {
        return Err(anyhow::anyhow!("Agent config not found: {}", name));
    }

    let content = tokio::fs::read_to_string(&agents_file)
        .await
        .with_context(|| format!("Failed to read agents config: {}", agents_file.display()))?;

    let agents: HashMap<String, AgentConfig> =
        serde_yaml::from_str(&content).with_context(|| "Failed to parse agents.yaml")?;

    agents
        .get(name)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", name))
}

/// Load models configuration
pub async fn load_models_config() -> Result<ModelsConfig> {
    let config_dir = get_config_dir();
    let models_file = config_dir.join("models.yaml");

    if !models_file.exists() {
        return Ok(ModelsConfig::default());
    }

    let content = tokio::fs::read_to_string(&models_file)
        .await
        .with_context(|| format!("Failed to read models config: {}", models_file.display()))?;

    let config: ModelsConfig =
        serde_yaml::from_str(&content).with_context(|| "Failed to parse models.yaml")?;

    Ok(config)
}

/// Merge agent config into runtime config
pub fn merge_agent_config(
    model: Option<String>,
    backend: Option<String>,
    agent_config: &AgentConfig,
) -> (Option<String>, Option<String>) {
    let model = model.or_else(|| agent_config.model.clone());
    let backend = backend.or_else(|| agent_config.backend.clone());
    (model, backend)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_config_parsing() {
        let yaml = r#"
name: test-agent
model: gpt-4
backend: codex
skipPermissions: true
env:
  TEST_VAR: value
"#;
        let config: AgentConfig = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(config.name, "test-agent");
        assert_eq!(config.model, Some("gpt-4".to_string()));
        assert!(config.skip_permissions);
    }

    #[test]
    fn test_merge_agent_config() {
        let agent = AgentConfig {
            name: "test".to_string(),
            model: Some("default-model".to_string()),
            backend: Some("claude".to_string()),
            ..Default::default()
        };

        // CLI overrides agent config
        let (model, backend) = merge_agent_config(Some("cli-model".to_string()), None, &agent);
        assert_eq!(model, Some("cli-model".to_string()));
        assert_eq!(backend, Some("claude".to_string()));

        // Agent config used when CLI doesn't specify
        let (model, backend) = merge_agent_config(None, None, &agent);
        assert_eq!(model, Some("default-model".to_string()));
        assert_eq!(backend, Some("claude".to_string()));
    }
}
