use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    #[default]
    ClaudeCode,
    Amp,
}

impl Provider {
    /// Find the binary for this provider by checking common installation paths.
    /// GUI apps on macOS don't inherit the user's shell PATH, so we can't rely on `which`.
    pub fn find_binary(&self) -> Option<PathBuf> {
        let home = std::env::var("HOME").ok()?;

        let candidates: Vec<String> = match self {
            Provider::ClaudeCode => vec![
                format!("{}/.local/bin/claude", home),
                "/usr/local/bin/claude".to_string(),
                "/opt/homebrew/bin/claude".to_string(),
                "/usr/bin/claude".to_string(),
            ],
            Provider::Amp => vec![
                format!("{}/.amp/bin/amp", home),
                format!("{}/.local/bin/amp", home),
                "/usr/local/bin/amp".to_string(),
                "/opt/homebrew/bin/amp".to_string(),
                "/usr/bin/amp".to_string(),
            ],
        };

        for path in &candidates {
            let path = PathBuf::from(path);
            if path.exists() {
                return Some(path);
            }
        }

        // Fallback: try which (works in dev mode with inherited PATH)
        let binary_name = self.binary_name();
        if let Ok(output) = Command::new("which").arg(binary_name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(PathBuf::from(path));
                }
            }
        }

        None
    }

    /// Get the binary name for this provider
    pub fn binary_name(&self) -> &'static str {
        match self {
            Provider::ClaudeCode => "claude",
            Provider::Amp => "amp",
        }
    }

    /// Build command arguments for running this provider
    pub fn build_args(&self, message: &str, session_id: Option<&str>) -> Vec<String> {
        match self {
            Provider::ClaudeCode => {
                let mut args = vec![
                    "-p".to_string(),
                    "--output-format".to_string(),
                    "stream-json".to_string(),
                    "--verbose".to_string(),
                    "--dangerously-skip-permissions".to_string(),
                ];

                if let Some(sid) = session_id {
                    args.push("--resume".to_string());
                    args.push(sid.to_string());
                }

                args.push(message.to_string());
                args
            }
            Provider::Amp => {
                let mut args = if let Some(sid) = session_id {
                    // Continuation uses different command structure
                    vec![
                        "threads".to_string(),
                        "continue".to_string(),
                        sid.to_string(),
                        "-x".to_string(),
                    ]
                } else {
                    vec!["-x".to_string()]
                };

                args.push(message.to_string());
                args.push("--stream-json".to_string());
                args.push("--dangerously-allow-all".to_string());
                args
            }
        }
    }

    /// Get human-readable display name
    pub fn display_name(&self) -> &'static str {
        match self {
            Provider::ClaudeCode => "Claude Code",
            Provider::Amp => "Amp",
        }
    }

    /// Get installation URL
    pub fn install_url(&self) -> &'static str {
        match self {
            Provider::ClaudeCode => "https://claude.com/product/claude-code",
            Provider::Amp => "https://ampcode.com",
        }
    }

    /// Get error message for when the provider is not installed
    pub fn not_installed_message(&self) -> String {
        format!(
            "{} is not installed. Please install it from {}",
            self.display_name(),
            self.install_url()
        )
    }

    /// Get error message for when the provider is not logged in
    pub fn not_logged_in_message(&self) -> &'static str {
        match self {
            Provider::ClaudeCode => {
                "Claude Code is not logged in. Please run 'claude' in your terminal to authenticate."
            }
            Provider::Amp => "Amp is not logged in. Please run 'amp login' to authenticate.",
        }
    }

    /// Get auth instructions
    pub fn auth_instructions(&self) -> &'static str {
        match self {
            Provider::ClaudeCode => "Run 'claude' in your terminal to authenticate",
            Provider::Amp => "Run 'amp login' to authenticate",
        }
    }

    /// Check if the provider is authenticated by looking for config files or running a check command
    pub fn check_authenticated(&self) -> Result<(), String> {
        let home = std::env::var("HOME").map_err(|_| "Cannot find home directory")?;

        match self {
            Provider::ClaudeCode => {
                // Claude Code stores auth in ~/.claude/.credentials.json or similar
                let credentials_path = format!("{}/.claude/.credentials.json", home);
                let config_path = format!("{}/.claude.json", home);

                // Check if either credential file exists
                if std::path::Path::new(&credentials_path).exists()
                    || std::path::Path::new(&config_path).exists()
                {
                    Ok(())
                } else {
                    Err(self.not_logged_in_message().to_string())
                }
            }
            Provider::Amp => {
                // Amp stores settings in ~/.config/amp/settings.json
                // Auth is handled via browser-based login, so we just check if the config dir exists
                let amp_settings = format!("{}/.config/amp/settings.json", home);

                if std::path::Path::new(&amp_settings).exists() {
                    Ok(())
                } else {
                    Err(self.not_logged_in_message().to_string())
                }
            }
        }
    }

    /// Detect authentication errors from provider output
    pub fn is_auth_error(&self, output: &str) -> bool {
        let lower = output.to_lowercase();
        match self {
            Provider::ClaudeCode => {
                lower.contains("not logged in")
                    || lower.contains("authentication")
                    || lower.contains("invalid api key")
                    || lower.contains("unauthorized")
                    || lower.contains("please run 'claude'")
            }
            Provider::Amp => {
                lower.contains("not logged in")
                    || lower.contains("authentication")
                    || lower.contains("invalid api key")
                    || lower.contains("unauthorized")
                    || lower.contains("amp login")
                    || lower.contains("please login")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_serde() {
        let claude = Provider::ClaudeCode;
        let serialized = serde_json::to_string(&claude).unwrap();
        assert_eq!(serialized, "\"claude_code\"");

        let amp = Provider::Amp;
        let serialized = serde_json::to_string(&amp).unwrap();
        assert_eq!(serialized, "\"amp\"");

        let deserialized: Provider = serde_json::from_str("\"claude_code\"").unwrap();
        assert_eq!(deserialized, Provider::ClaudeCode);

        let deserialized: Provider = serde_json::from_str("\"amp\"").unwrap();
        assert_eq!(deserialized, Provider::Amp);
    }

    #[test]
    fn test_default_provider() {
        assert_eq!(Provider::default(), Provider::ClaudeCode);
    }

    #[test]
    fn test_build_args_claude_new_session() {
        let args = Provider::ClaudeCode.build_args("test message", None);
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"--output-format".to_string()));
        assert!(args.contains(&"stream-json".to_string()));
        assert!(args.contains(&"--verbose".to_string()));
        assert!(args.contains(&"--dangerously-skip-permissions".to_string()));
        assert!(args.contains(&"test message".to_string()));
        assert!(!args.contains(&"--resume".to_string()));
    }

    #[test]
    fn test_build_args_claude_resume() {
        let args = Provider::ClaudeCode.build_args("test message", Some("session-123"));
        assert!(args.contains(&"--resume".to_string()));
        assert!(args.contains(&"session-123".to_string()));
    }

    #[test]
    fn test_build_args_amp_new_session() {
        let args = Provider::Amp.build_args("test message", None);
        assert!(args.contains(&"-x".to_string()));
        assert!(args.contains(&"test message".to_string()));
        assert!(args.contains(&"--stream-json".to_string()));
        assert!(args.contains(&"--dangerously-allow-all".to_string()));
        assert!(!args.contains(&"threads".to_string()));
    }

    #[test]
    fn test_build_args_amp_resume() {
        let args = Provider::Amp.build_args("test message", Some("thread-123"));
        assert!(args.contains(&"threads".to_string()));
        assert!(args.contains(&"continue".to_string()));
        assert!(args.contains(&"thread-123".to_string()));
        assert!(args.contains(&"-x".to_string()));
        assert!(args.contains(&"test message".to_string()));
    }
}
