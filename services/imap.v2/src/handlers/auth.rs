use crate::protocol::constants::{ImapState, CAPABILITIES_SECURE};
use crate::protocol::response::ImapResponse;
use crate::server::client_session::{AuthenticatedUser, ClientSession};
use crate::services::db::DbService;
use base64::Engine;
use sqlx::Row;
use std::collections::HashSet;
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{error, info, warn};
use uuid::Uuid;

pub struct DefaultSystemFolder {
    pub name: &'static str,
    pub folder_type: &'static str,
    pub sort_order: i32,
    pub is_system: bool,
}

pub const DEFAULT_SYSTEM_FOLDERS: &[DefaultSystemFolder] = &[
    DefaultSystemFolder {
        name: "받은편지함",
        folder_type: "INBOX",
        sort_order: 1,
        is_system: true,
    },
    DefaultSystemFolder {
        name: "보낸편지함",
        folder_type: "SENT",
        sort_order: 2,
        is_system: true,
    },
    DefaultSystemFolder {
        name: "임시보관함",
        folder_type: "DRAFTS",
        sort_order: 3,
        is_system: true,
    },
    DefaultSystemFolder {
        name: "스팸메일함",
        folder_type: "SPAM",
        sort_order: 4,
        is_system: true,
    },
    DefaultSystemFolder {
        name: "휴지통",
        folder_type: "TRASH",
        sort_order: 5,
        is_system: true,
    },
    DefaultSystemFolder {
        name: "개인편지함",
        folder_type: "CUSTOM",
        sort_order: 6,
        is_system: true,
    },
];

pub struct AuthHandler;

impl AuthHandler {
    pub async fn handle_login(
        session: &mut ClientSession,
        tag: &str,
        username: Option<&str>,
        password: Option<&str>,
    ) -> io::Result<()> {
        if session.state() != ImapState::NotAuthenticated {
            session
                .write_str(&ImapResponse::tagged(tag, "BAD", "Already authenticated", None))
                .await?;
            return Ok(());
        }

        let (Some(raw_user), Some(raw_pass)) = (username, password) else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "BAD",
                    "LOGIN requires username and password arguments",
                    None,
                ))
                .await?;
            return Ok(());
        };

        if raw_user.is_empty() || raw_pass.is_empty() {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "BAD",
                    "LOGIN requires username and password arguments",
                    None,
                ))
                .await?;
            return Ok(());
        }

        let clean_username = strip_outer_quotes(raw_user.trim());
        let clean_password = strip_outer_quotes(raw_pass);
        let norm_email = clean_username.to_lowercase();

        info!(
            "[AuthHandler] Login attempt for account \"{}\" from {}",
            norm_email, session.id
        );

        // 시스템 라이선스 유효성 검증 (파일-DB 무결성, 만료, 정원)
        let license_status = session.ctx().license.check_license(false).await;
        if !license_status.is_valid {
            warn!(
                "[AuthHandler] Login BLOCKED for \"{}\" from {}: {}",
                norm_email, session.id, license_status.message
            );
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    &format!(
                        "[UNAVAILABLE] System license required: {}",
                        license_status.message
                    ),
                    Some("SERVERERROR"),
                ))
                .await?;
            return Ok(());
        }

        let db = session.ctx().db.clone();
        let user_row = match sqlx::query(
            "SELECT id, email, password_hash, name, is_active FROM `user` WHERE LOWER(email) = ? LIMIT 1",
        )
        .bind(&norm_email)
        .fetch_optional(db.pool())
        .await
        {
            Ok(row) => row,
            Err(e) => {
                error!(
                    "[AuthHandler] Error during LOGIN for \"{}\" from {}: {}",
                    norm_email, session.id, e
                );
                session
                    .write_str(&ImapResponse::tagged(
                        tag,
                        "NO",
                        "Internal server error during authentication",
                        None,
                    ))
                    .await?;
                return Ok(());
            }
        };

        let Some(row) = user_row else {
            warn!(
                "[AuthHandler] Login FAILED for \"{}\" from {}: User not found",
                norm_email, session.id
            );
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Invalid login credentials",
                    Some("AUTHENTICATIONFAILED"),
                ))
                .await?;
            return Ok(());
        };

        let user_id: String = row.try_get("id").unwrap_or_default();
        let email: String = row.try_get("email").unwrap_or_default();
        let password_hash: String = row.try_get("password_hash").unwrap_or_default();
        let name: String = row.try_get("name").unwrap_or_default();
        let is_active: bool = row.try_get("is_active").unwrap_or(false);

        if !is_active {
            warn!(
                "[AuthHandler] Login FAILED for \"{}\" from {}: Account is inactive or disabled",
                norm_email, session.id
            );
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Account is inactive or disabled",
                    Some("AUTHENTICATIONFAILED"),
                ))
                .await?;
            return Ok(());
        }

        // bcrypt CPU 바운드 검증은 blocking 풀에서 실행
        let pw_owned = clean_password.to_string();
        let hash_owned = password_hash.clone();
        let is_match = tokio::task::spawn_blocking(move || {
            bcrypt::verify(&pw_owned, &hash_owned).unwrap_or(false)
        })
        .await
        .unwrap_or(false);

        if !is_match {
            warn!(
                "[AuthHandler] Login FAILED for \"{}\" from {}: Password mismatch",
                norm_email, session.id
            );
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Invalid login credentials",
                    Some("AUTHENTICATIONFAILED"),
                ))
                .await?;
            return Ok(());
        }

        // 최근 로그인 시각 갱신
        if let Err(e) = sqlx::query("UPDATE `user` SET last_login_at = NOW() WHERE id = ?")
            .bind(&user_id)
            .execute(db.pool())
            .await
        {
            error!(
                "[AuthHandler] Failed to update last_login_at for {}: {}",
                user_id, e
            );
        }

        // 기본 시스템 폴더 보장
        if let Err(e) = Self::ensure_default_folders(&db, &user_id).await {
            error!(
                "[AuthHandler] Failed to ensure default folders for {}: {}",
                user_id, e
            );
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Internal server error during authentication",
                    None,
                ))
                .await?;
            return Ok(());
        }

        session.set_user(AuthenticatedUser {
            id: user_id.clone(),
            email: email.clone(),
            name,
        });

        let cap_code = format!("CAPABILITY {}", CAPABILITIES_SECURE.join(" "));
        session
            .write_str(&ImapResponse::tagged(
                tag,
                "OK",
                &format!("Logged in as {email}"),
                Some(&cap_code),
            ))
            .await?;

        info!(
            "[AuthHandler] Login SUCCESS: User \"{}\" (ID: {}) logged in via IMAP from {}",
            email, user_id, session.id
        );
        Ok(())
    }

    pub async fn handle_authenticate_plain(
        session: &mut ClientSession,
        tag: &str,
        base64_payload: &str,
    ) -> io::Result<()> {
        let decoded_bytes = match base64::engine::general_purpose::STANDARD
            .decode(base64_payload.trim())
        {
            Ok(b) => b,
            Err(e) => {
                warn!(
                    "[AuthHandler] AUTHENTICATE PLAIN failed for {}: {}",
                    session.id, e
                );
                session
                    .write_str(&ImapResponse::tagged(
                        tag,
                        "NO",
                        &format!("AUTHENTICATE failed: {e}"),
                        Some("AUTHENTICATIONFAILED"),
                    ))
                    .await?;
                return Ok(());
            }
        };

        let decoded = String::from_utf8_lossy(&decoded_bytes);
        let parts: Vec<&str> = decoded.split('\0').collect();

        let (username, password) = if parts.len() >= 3 {
            (parts[1], parts[2])
        } else if parts.len() == 2 {
            (parts[0], parts[1])
        } else {
            ("", "")
        };

        info!(
            "[AuthHandler] AUTHENTICATE PLAIN attempt for user: \"{}\" from {}",
            username, session.id
        );
        Self::handle_login(session, tag, Some(username), Some(password)).await
    }

    pub async fn ensure_default_folders(db: &DbService, user_id: &str) -> Result<(), sqlx::Error> {
        let rows = sqlx::query("SELECT `type` FROM mail_folder WHERE user_id = ?")
            .bind(user_id)
            .fetch_all(db.pool())
            .await?;

        let existing_types: HashSet<String> = rows
            .into_iter()
            .filter_map(|r| r.try_get::<String, _>("type").ok())
            .collect();

        let now_seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as u32)
            .unwrap_or(1);

        for def in DEFAULT_SYSTEM_FOLDERS {
            if !existing_types.contains(def.folder_type) {
                sqlx::query(
                    "INSERT INTO mail_folder (id, user_id, parent_id, name, `type`, sort_order, is_system, uidvalidity, uidnext, created_at, updated_at) \
                     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, NOW(), NOW())",
                )
                .bind(Uuid::new_v4().to_string())
                .bind(user_id)
                .bind(def.name)
                .bind(def.folder_type)
                .bind(def.sort_order)
                .bind(def.is_system)
                .bind(now_seconds)
                .execute(db.pool())
                .await?;
            }
        }

        Ok(())
    }
}

fn strip_outer_quotes(s: &str) -> &str {
    if s.len() >= 2 {
        if (s.starts_with('"') && s.ends_with('"')) || (s.starts_with('\'') && s.ends_with('\'')) {
            return &s[1..s.len() - 1];
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_outer_quotes() {
        assert_eq!(strip_outer_quotes("\"hello\""), "hello");
        assert_eq!(strip_outer_quotes("'hello'"), "hello");
        assert_eq!(strip_outer_quotes("plain"), "plain");
    }

    #[test]
    fn test_bcrypt_compatibility() {
        let hash = bcrypt::hash("TestPass123!", 4).expect("hash");
        assert!(bcrypt::verify("TestPass123!", &hash).expect("verify"));
        assert!(!bcrypt::verify("WrongPass", &hash).expect("verify"));
    }
}
