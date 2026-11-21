use std::env;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct ImapServerConfig {
    pub host: String,
    pub port: u16,
    pub secure_port: u16,
    pub enable_starttls: bool,
    pub max_connections: usize,
    pub auth_timeout_ms: u64,
    pub cert_path: Option<String>,
    pub key_path: Option<String>,
    pub archive_dir: PathBuf,
}

/// `.env` 파일을 기존 `services/imap/src/config/env-loader.ts`와 동일한 우선순위로 탐색하여 로드합니다.
pub fn load_env() {
    let mut candidate_dirs: Vec<PathBuf> = Vec::new();

    if let Ok(cwd) = env::current_dir() {
        candidate_dirs.push(cwd.clone());
        if let Some(p1) = cwd.parent() {
            candidate_dirs.push(p1.to_path_buf());
            if let Some(p2) = p1.parent() {
                candidate_dirs.push(p2.to_path_buf());
            }
        }
    }

    if let Ok(exe_path) = env::current_exe() {
        let mut cur: Option<&Path> = exe_path.parent();
        for _ in 0..4 {
            if let Some(dir) = cur {
                candidate_dirs.push(dir.to_path_buf());
                cur = dir.parent();
            } else {
                break;
            }
        }
    }

    for dir in candidate_dirs {
        let env_file = dir.join(".env");
        if env_file.is_file() {
            let _ = dotenvy::from_path(&env_file);
            return;
        }
    }
}

impl ImapServerConfig {
    pub fn from_env() -> Self {
        load_env();

        let host = env::var("IMAP_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port = env::var("IMAP_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(1143);
        let secure_port = env::var("IMAPS_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(1993);
        let enable_starttls = env::var("IMAP_STARTTLS")
            .map(|v| v != "false")
            .unwrap_or(true);
        let max_connections = env::var("IMAP_MAX_CONNECTIONS")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(200);
        let auth_timeout_ms = env::var("IMAP_AUTH_TIMEOUT_MS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(60_000);

        let cert_path = env::var("MAIL_TLS_CERT")
            .ok()
            .filter(|s| !s.is_empty())
            .or_else(|| env::var("IMAP_TLS_CERT").ok().filter(|s| !s.is_empty()));
        let key_path = env::var("MAIL_TLS_KEY")
            .ok()
            .filter(|s| !s.is_empty())
            .or_else(|| env::var("IMAP_TLS_KEY").ok().filter(|s| !s.is_empty()));

        let archive_raw = env::var("MAIL_ARCHIVE_DIR")
            .ok()
            .filter(|s| !s.is_empty())
            .or_else(|| env::var("ARCHIVE_DIR").ok().filter(|s| !s.is_empty()))
            .unwrap_or_else(|| "./mail-archive".to_string());

        let archive_dir = {
            let p = PathBuf::from(&archive_raw);
            if p.is_absolute() {
                p
            } else {
                env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join(p)
            }
        };

        Self {
            host,
            port,
            secure_port,
            enable_starttls,
            max_connections,
            auth_timeout_ms,
            cert_path,
            key_path,
            archive_dir,
        }
    }
}
