use crate::handlers::folder::FolderHandler;
use crate::protocol::response::ImapResponse;
use crate::server::client_session::ClientSession;
use chrono::{Datelike, Local};
use mail_parser::MessageParser;
use std::fs;
use std::io;
use tracing::{info, warn};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ParsedAppendMeta {
    pub subject: String,
    pub from: String,
    pub message_id_header: String,
    pub to_recipients: Vec<String>,
}

pub struct AppendHandler;

impl AppendHandler {
    pub fn extract_metadata(
        literal_data: &[u8],
        fallback_from: &str,
        mail_id: &str,
    ) -> ParsedAppendMeta {
        let mut subject = "(No Subject)".to_string();
        let mut from = fallback_from.to_string();
        let mut message_id_header = format!("<{mail_id}@lemail.local>");
        let mut to_recipients: Vec<String> = Vec::new();

        if let Some(parsed) = MessageParser::default().parse(literal_data) {
            if let Some(subj) = parsed.subject() {
                let s = subj.trim();
                if !s.is_empty() {
                    subject = s.to_string();
                }
            }

            if let Some(from_hdr) = parsed.from() {
                if let Some(first) = from_hdr.first() {
                    let formatted = match (first.name(), first.address()) {
                        (Some(n), Some(a)) if !n.trim().is_empty() => {
                            format!("{} <{}>", n.trim(), a.trim())
                        }
                        (_, Some(a)) => a.trim().to_string(),
                        (Some(n), None) => n.trim().to_string(),
                        (None, None) => String::new(),
                    };
                    if !formatted.is_empty() {
                        from = formatted;
                    }
                }
            }

            if let Some(mid) = parsed.message_id() {
                let m = mid.trim();
                if !m.is_empty() {
                    message_id_header = if m.starts_with('<') && m.ends_with('>') {
                        m.to_string()
                    } else {
                        format!("<{m}>")
                    };
                }
            }

            if let Some(to_hdr) = parsed.to() {
                for addr in to_hdr.iter() {
                    if let Some(email) = addr.address() {
                        let e = email.trim();
                        if !e.is_empty() {
                            to_recipients.push(e.to_string());
                        }
                    }
                }
            }
        } else {
            warn!("[AppendHandler] mail-parser returned None; using raw header fallback");
            let preview_len = literal_data.len().min(8192);
            let raw_text = String::from_utf8_lossy(&literal_data[..preview_len]);
            let header_block = raw_text
                .split("\r\n\r\n")
                .next()
                .unwrap_or(&raw_text);

            for line in header_block.lines() {
                let line = line.trim_end_matches('\r');
                if let Some(v) = strip_header_prefix(line, "Subject:") {
                    if !v.is_empty() {
                        subject = v.to_string();
                    }
                } else if let Some(v) = strip_header_prefix(line, "From:") {
                    if !v.is_empty() {
                        from = v.to_string();
                    }
                } else if let Some(v) = strip_header_prefix(line, "Message-ID:") {
                    if !v.is_empty() {
                        message_id_header = v.to_string();
                    }
                } else if let Some(v) = strip_header_prefix(line, "To:") {
                    if !v.is_empty() {
                        to_recipients.push(v.to_string());
                    }
                }
            }
        }

        ParsedAppendMeta {
            subject,
            from,
            message_id_header,
            to_recipients,
        }
    }

    pub async fn handle_append(
        session: &mut ClientSession,
        tag: &str,
        mailbox_name: &str,
        flags_raw: &str,
        literal_data: &[u8],
    ) -> io::Result<()> {
        let Some(user) = session.user().cloned() else {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Please log in first", None))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let Some(folder) = FolderHandler::resolve_folder(&db, &user.id, mailbox_name).await else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    &format!("Mailbox does not exist: {mailbox_name}"),
                    Some("TRYCREATE"),
                ))
                .await?;
            return Ok(());
        };

        let mail_id = Uuid::new_v4().to_string();
        let now = Local::now();
        let target_dir = session
            .ctx()
            .archive_dir
            .join(format!("{:04}", now.year()))
            .join(format!("{:02}", now.month()))
            .join(format!("{:02}", now.day()));

        if let Err(e) = fs::create_dir_all(&target_dir) {
            warn!("[AppendHandler] Failed to create archive dir: {}", e);
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    &format!("Failed to create mail archive directory: {e}"),
                    None,
                ))
                .await?;
            return Ok(());
        }

        let target_file_path = target_dir.join(format!("{mail_id}.eml"));
        if let Err(e) = fs::write(&target_file_path, literal_data) {
            warn!("[AppendHandler] Failed to write .eml file: {}", e);
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    &format!("Failed to write message file: {e}"),
                    None,
                ))
                .await?;
            return Ok(());
        }

        let meta = Self::extract_metadata(literal_data, &user.email, &mail_id);

        let upper_flags = flags_raw.to_ascii_uppercase();
        let is_read = upper_flags.contains("\\SEEN");
        let is_starred = upper_flags.contains("\\FLAGGED");
        let is_deleted = upper_flags.contains("\\DELETED");
        let is_answered = upper_flags.contains("\\ANSWERED");
        let is_draft = upper_flags.contains("\\DRAFT");

        let raw_file_path_str = target_file_path.to_string_lossy().to_string();

        // 1. mail_message 적재
        if let Err(e) = sqlx::query(
            "INSERT INTO mail_message (id, direction, message_id, sender, subject, raw_file_path, status, created_at) \
             VALUES (?, 'OUTBOUND', ?, ?, ?, ?, 'PROCESSED', NOW())",
        )
        .bind(&mail_id)
        .bind(&meta.message_id_header)
        .bind(&meta.from)
        .bind(&meta.subject)
        .bind(&raw_file_path_str)
        .execute(db.pool())
        .await
        {
            warn!("[AppendHandler] Failed to insert mail_message: {}", e);
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Internal database error during APPEND",
                    None,
                ))
                .await?;
            return Ok(());
        }

        // 2. mail_recipient 적재
        for to_addr in &meta.to_recipients {
            let _ = sqlx::query(
                "INSERT INTO mail_recipient (message_id, `type`, address) VALUES (?, 'TO', ?)",
            )
            .bind(&mail_id)
            .bind(to_addr)
            .execute(db.pool())
            .await;
        }

        // 3. 폴더 UID 할당
        let allocated_uid = folder.uidnext.max(1);
        let next_uid = allocated_uid + 1;
        let _ = sqlx::query("UPDATE mail_folder SET uidnext = ? WHERE id = ?")
            .bind(next_uid)
            .bind(&folder.id)
            .execute(db.pool())
            .await;

        // 4. user_mail 적재
        let user_mail_id = Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO user_mail (id, user_id, folder_id, message_id, uid, is_read, is_starred, is_deleted, is_answered, is_draft, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
        )
        .bind(&user_mail_id)
        .bind(&user.id)
        .bind(&folder.id)
        .bind(&mail_id)
        .bind(allocated_uid)
        .bind(is_read)
        .bind(is_starred)
        .bind(is_deleted)
        .bind(is_answered)
        .bind(is_draft)
        .execute(db.pool())
        .await;

        let code = format!("APPENDUID {} {}", folder.uidvalidity.max(1), allocated_uid);
        session
            .write_str(&ImapResponse::tagged(
                tag,
                "OK",
                "APPEND completed",
                Some(&code),
            ))
            .await?;

        info!(
            "[AppendHandler] Appended mail {} (UID: {}) into folder [{}] for user {}",
            mail_id, allocated_uid, folder.name, user.email
        );
        Ok(())
    }
}

fn strip_header_prefix<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    if line.len() >= prefix.len() && line[..prefix.len()].eq_ignore_ascii_case(prefix) {
        Some(line[prefix.len()..].trim())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_append_rfc2047_utf8_and_euckr_korean_subjects() {
        // UTF-8 Base64: "안녕하세요 테스트 메일"
        let eml_utf8 = b"From: =?UTF-8?B?7ZmN6ri464+Z?= <hong@lineedge.com>\r\n\
To: user@lineedge.com\r\n\
Subject: =?UTF-8?B?7JWI64WV7ZWY7IS47JqUIO2FjOyKpO2KuCDrqZTsnbw=?=\r\n\
Message-ID: <test-utf8@lineedge.com>\r\n\
\r\n\
Hello body\r\n";

        let meta = AppendHandler::extract_metadata(eml_utf8, "fallback@local", "id1");
        assert_eq!(meta.subject, "안녕하세요 테스트 메일");
        assert_eq!(meta.from, "홍길동 <hong@lineedge.com>");
        assert_eq!(meta.message_id_header, "<test-utf8@lineedge.com>");
        assert_eq!(meta.to_recipients, vec!["user@lineedge.com"]);

        // KS_C_5601-1987 / EUC-KR Base64: "한글 제목"
        let euckr_bytes: &[u8] = &[0xC7, 0xD1, 0xB1, 0xDB, 0x20, 0xC1, 0xA6, 0xB8, 0xF1];
        let euckr_b64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            euckr_bytes,
        );
        let eml_euckr = format!(
            "From: sender@lineedge.com\r\n\
             To: recv@lineedge.com\r\n\
             Subject: =?ks_c_5601-1987?B?{euckr_b64}?=\r\n\
             \r\n\
             Body\r\n"
        );

        let meta_kr = AppendHandler::extract_metadata(eml_euckr.as_bytes(), "fallback@local", "id2");
        assert_eq!(meta_kr.subject, "한글 제목");
        assert_eq!(meta_kr.to_recipients, vec!["recv@lineedge.com"]);
    }
}
