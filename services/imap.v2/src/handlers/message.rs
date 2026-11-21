use crate::handlers::folder::FolderHandler;
use crate::protocol::response::ImapResponse;
use crate::server::client_session::ClientSession;
use crate::services::db::DbService;
use crate::utils::imap_utils::{EnvelopeInput, ImapUtils, MailFlags};
use base64::Engine;
use chrono::{DateTime, Utc};
use sqlx::Row;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct EnrichedUserMail {
    pub id: String,
    pub user_id: String,
    pub folder_id: String,
    pub message_id: String,
    pub uid: u32,
    pub is_read: bool,
    pub is_starred: bool,
    pub is_deleted: bool,
    pub is_answered: bool,
    pub is_draft: bool,
    pub created_at: DateTime<Utc>,
    pub seq: u32,
    pub sender: String,
    pub subject: Option<String>,
    pub raw_file_path: String,
    pub mail_created_at: DateTime<Utc>,
    pub message_id_header: Option<String>,
}

impl EnrichedUserMail {
    pub fn flags(&self) -> MailFlags {
        MailFlags {
            is_read: self.is_read,
            is_starred: self.is_starred,
            is_deleted: self.is_deleted,
            is_answered: self.is_answered,
            is_draft: self.is_draft,
        }
    }
}

struct FetchPart {
    text: String,
    literal: Option<Vec<u8>>,
}

pub struct MessageHandler;

impl MessageHandler {
    pub async fn get_mailbox_messages(
        db: &DbService,
        user_id: &str,
        folder_id: &str,
        include_deleted: bool,
    ) -> Vec<EnrichedUserMail> {
        let sql = if include_deleted {
            "SELECT \
               um.id, um.user_id, um.folder_id, um.message_id, um.uid, \
               um.is_read, um.is_starred, um.is_deleted, um.is_answered, um.is_draft, \
               um.created_at, \
               mm.sender, mm.subject, mm.raw_file_path, mm.created_at AS mail_created_at, \
               mm.message_id AS message_id_header \
             FROM user_mail um \
             JOIN mail_message mm ON mm.id = um.message_id \
             WHERE um.user_id = ? AND um.folder_id = ? \
             ORDER BY um.uid ASC"
        } else {
            "SELECT \
               um.id, um.user_id, um.folder_id, um.message_id, um.uid, \
               um.is_read, um.is_starred, um.is_deleted, um.is_answered, um.is_draft, \
               um.created_at, \
               mm.sender, mm.subject, mm.raw_file_path, mm.created_at AS mail_created_at, \
               mm.message_id AS message_id_header \
             FROM user_mail um \
             JOIN mail_message mm ON mm.id = um.message_id \
             WHERE um.user_id = ? AND um.folder_id = ? AND um.is_deleted = false \
             ORDER BY um.uid ASC"
        };

        let rows = sqlx::query(sql)
            .bind(user_id)
            .bind(folder_id)
            .fetch_all(db.pool())
            .await
            .unwrap_or_default();

        let now = Utc::now();
        rows.into_iter()
            .enumerate()
            .map(|(idx, r)| {
                let created_at: DateTime<Utc> = r.try_get("created_at").unwrap_or(now);
                let mail_created_at: DateTime<Utc> =
                    r.try_get("mail_created_at").unwrap_or(created_at);
                EnrichedUserMail {
                    id: r.try_get("id").unwrap_or_default(),
                    user_id: r.try_get("user_id").unwrap_or_default(),
                    folder_id: r.try_get("folder_id").unwrap_or_default(),
                    message_id: r.try_get("message_id").unwrap_or_default(),
                    uid: r.try_get("uid").unwrap_or(0),
                    is_read: r.try_get("is_read").unwrap_or(false),
                    is_starred: r.try_get("is_starred").unwrap_or(false),
                    is_deleted: r.try_get("is_deleted").unwrap_or(false),
                    is_answered: r.try_get("is_answered").unwrap_or(false),
                    is_draft: r.try_get("is_draft").unwrap_or(false),
                    created_at,
                    seq: (idx + 1) as u32,
                    sender: r.try_get("sender").unwrap_or_default(),
                    subject: r.try_get("subject").ok().flatten(),
                    raw_file_path: r.try_get("raw_file_path").unwrap_or_default(),
                    mail_created_at,
                    message_id_header: r.try_get("message_id_header").ok().flatten(),
                }
            })
            .collect()
    }

    pub async fn handle_fetch(
        session: &mut ClientSession,
        tag: &str,
        sequence_set: &str,
        fetch_items_raw: &str,
        is_uid: bool,
    ) -> io::Result<()> {
        let (Some(user), Some(mailbox)) = (
            session.user().cloned(),
            session.selected_mailbox().cloned(),
        ) else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Select a mailbox first",
                    None,
                ))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let messages = Self::get_mailbox_messages(&db, &user.id, &mailbox.id, false).await;
        if messages.is_empty() {
            let prefix = if is_uid { "UID " } else { "" };
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "OK",
                    &format!("{prefix}FETCH completed"),
                    None,
                ))
                .await?;
            return Ok(());
        }

        let max_val = if is_uid {
            messages.last().map(|m| m.uid).unwrap_or(0)
        } else {
            messages.len() as u32
        };
        let requested_set: HashSet<u32> = ImapUtils::parse_sequence_set(sequence_set, max_val)
            .into_iter()
            .collect();

        let mut requested_items = Self::parse_fetch_items(fetch_items_raw);
        let upper_items: Vec<String> = requested_items
            .iter()
            .map(|i| i.to_ascii_uppercase())
            .collect();

        if upper_items.iter().any(|i| i == "ALL") {
            requested_items = vec![
                "FLAGS".into(),
                "INTERNALDATE".into(),
                "RFC822.SIZE".into(),
                "ENVELOPE".into(),
            ];
        } else if upper_items.iter().any(|i| i == "FAST") {
            requested_items = vec!["FLAGS".into(), "INTERNALDATE".into(), "RFC822.SIZE".into()];
        } else if upper_items.iter().any(|i| i == "FULL") {
            requested_items = vec![
                "FLAGS".into(),
                "INTERNALDATE".into(),
                "RFC822.SIZE".into(),
                "ENVELOPE".into(),
                "BODY".into(),
            ];
        }

        if is_uid && !requested_items.iter().any(|i| i.eq_ignore_ascii_case("UID")) {
            requested_items.push("UID".into());
        }

        let needs_recipients = requested_items.iter().any(|i| {
            let u = i.to_ascii_uppercase();
            u == "ENVELOPE" || u.contains("HEADER") || u.starts_with("BODY") || u.starts_with("RFC822")
        });

        for mut msg in messages
            .into_iter()
            .filter(|m| requested_set.contains(&if is_uid { m.uid } else { m.seq }))
        {
            let mut to_recipients = Vec::new();
            let mut cc_recipients = Vec::new();
            let mut bcc_recipients = Vec::new();

            if needs_recipients {
                let rec_rows = sqlx::query(
                    "SELECT `type`, address FROM mail_recipient WHERE message_id = ?",
                )
                .bind(&msg.message_id)
                .fetch_all(db.pool())
                .await
                .unwrap_or_default();

                for r in rec_rows {
                    let rtype: String = r.try_get("type").unwrap_or_default();
                    let addr: String = r.try_get("address").unwrap_or_default();
                    match rtype.as_str() {
                        "TO" => to_recipients.push(addr),
                        "CC" => cc_recipients.push(addr),
                        "BCC" => bcc_recipients.push(addr),
                        _ => {}
                    }
                }
            }

            let mut parts: Vec<FetchPart> = Vec::new();

            for item in &requested_items {
                let upper_item = item.to_ascii_uppercase();

                if upper_item == "UID" {
                    parts.push(FetchPart {
                        text: format!("UID {}", msg.uid),
                        literal: None,
                    });
                } else if upper_item == "FLAGS" {
                    parts.push(FetchPart {
                        text: format!("FLAGS {}", ImapUtils::format_flags(msg.flags())),
                        literal: None,
                    });
                } else if upper_item == "INTERNALDATE" {
                    parts.push(FetchPart {
                        text: format!(
                            "INTERNALDATE \"{}\"",
                            ImapUtils::format_internal_date(msg.mail_created_at)
                        ),
                        literal: None,
                    });
                } else if upper_item == "RFC822.SIZE" {
                    let size = Self::resolve_raw_file_path(&msg.raw_file_path)
                        .and_then(|p| fs::metadata(p).ok())
                        .map(|m| m.len())
                        .unwrap_or(0);
                    parts.push(FetchPart {
                        text: format!("RFC822.SIZE {size}"),
                        literal: None,
                    });
                } else if upper_item == "ENVELOPE" {
                    let env_str = ImapUtils::format_envelope(&EnvelopeInput {
                        date: msg.mail_created_at,
                        subject: msg.subject.as_deref(),
                        from: &msg.sender,
                        to: &to_recipients,
                        cc: &cc_recipients,
                        bcc: &bcc_recipients,
                        in_reply_to: None,
                        message_id: msg.message_id_header.as_deref(),
                    });
                    parts.push(FetchPart {
                        text: format!("ENVELOPE {env_str}"),
                        literal: None,
                    });
                } else if upper_item == "BODYSTRUCTURE" || upper_item == "BODY" {
                    let size = Self::resolve_raw_file_path(&msg.raw_file_path)
                        .and_then(|p| fs::metadata(p).ok())
                        .map(|m| m.len())
                        .unwrap_or(0);
                    parts.push(FetchPart {
                        text: format!(
                            "BODYSTRUCTURE (\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {size} 100 NIL NIL NIL NIL)"
                        ),
                        literal: None,
                    });
                } else if upper_item.starts_with("BODY.PEEK[")
                    || upper_item.starts_with("BODY[")
                    || upper_item == "RFC822"
                    || upper_item == "RFC822.HEADER"
                    || upper_item == "RFC822.TEXT"
                {
                    let raw_eml = Self::load_or_synthesize_eml(&msg, &to_recipients);
                    let mut return_item_name = String::new();
                    let mut content_buf: Vec<u8> = raw_eml.clone();

                    if upper_item.starts_with("BODY.PEEK[") || upper_item.starts_with("BODY[") {
                        let (section_raw, partial_offset, partial_length) =
                            Self::parse_body_section(item);
                        let section = section_raw.to_ascii_uppercase();

                        return_item_name = format!("BODY[{section_raw}]");
                        if let Some(off) = partial_offset {
                            return_item_name.push_str(&format!("<{off}>"));
                        }

                        if section.is_empty() {
                            content_buf = raw_eml;
                        } else if section == "HEADER" || section.ends_with(".MIME") {
                            content_buf = Self::extract_header(&raw_eml).to_vec();
                        } else if section.starts_with("HEADER.FIELDS.NOT") {
                            let fields = Self::extract_paren_fields(&section);
                            content_buf = Self::extract_header_fields(&raw_eml, &fields, true);
                        } else if section.starts_with("HEADER.FIELDS") {
                            let fields = Self::extract_paren_fields(&section);
                            content_buf = Self::extract_header_fields(&raw_eml, &fields, false);
                        } else if section == "TEXT" {
                            content_buf = Self::extract_text(&raw_eml).to_vec();
                        } else {
                            content_buf = raw_eml;
                        }

                        if let Some(off) = partial_offset {
                            let start = off.min(content_buf.len());
                            let end = match partial_length {
                                Some(len) => (start + len).min(content_buf.len()),
                                None => content_buf.len(),
                            };
                            content_buf = content_buf[start..end].to_vec();
                        }

                        if !upper_item.contains("PEEK") && !msg.is_read {
                            msg.is_read = true;
                            let _ = sqlx::query("UPDATE user_mail SET is_read = true WHERE id = ?")
                                .bind(&msg.id)
                                .execute(db.pool())
                                .await;
                        }
                    } else if upper_item == "RFC822" {
                        return_item_name = "RFC822".to_string();
                        content_buf = raw_eml;
                        if !msg.is_read {
                            msg.is_read = true;
                            let _ = sqlx::query("UPDATE user_mail SET is_read = true WHERE id = ?")
                                .bind(&msg.id)
                                .execute(db.pool())
                                .await;
                        }
                    } else if upper_item == "RFC822.HEADER" {
                        return_item_name = "RFC822.HEADER".to_string();
                        content_buf = Self::extract_header(&raw_eml).to_vec();
                    } else if upper_item == "RFC822.TEXT" {
                        return_item_name = "RFC822.TEXT".to_string();
                        content_buf = Self::extract_text(&raw_eml).to_vec();
                        if !msg.is_read {
                            msg.is_read = true;
                            let _ = sqlx::query("UPDATE user_mail SET is_read = true WHERE id = ?")
                                .bind(&msg.id)
                                .execute(db.pool())
                                .await;
                        }
                    }

                    parts.push(FetchPart {
                        text: format!("{return_item_name} {{{}}}\r\n", content_buf.len()),
                        literal: Some(content_buf),
                    });
                }
            }

            if parts.iter().any(|p| p.literal.is_some()) {
                session.write_str(&format!("* {} FETCH (", msg.seq)).await?;
                for (idx, part) in parts.iter().enumerate() {
                    session.write_str(&part.text).await?;
                    if let Some(lit) = &part.literal {
                        session.write_bytes(lit).await?;
                    }
                    if idx + 1 < parts.len() {
                        session.write_str(" ").await?;
                    }
                }
                session.write_str(")\r\n").await?;
            } else {
                let line = parts
                    .iter()
                    .map(|p| p.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" ");
                session
                    .write_str(&format!("* {} FETCH ({line})\r\n", msg.seq))
                    .await?;
            }
        }

        let prefix = if is_uid { "UID " } else { "" };
        session
            .write_str(&ImapResponse::tagged(
                tag,
                "OK",
                &format!("{prefix}FETCH completed"),
                None,
            ))
            .await?;
        Ok(())
    }

    fn load_or_synthesize_eml(msg: &EnrichedUserMail, to_recipients: &[String]) -> Vec<u8> {
        if let Some(resolved) = Self::resolve_raw_file_path(&msg.raw_file_path) {
            if let Ok(bytes) = fs::read(&resolved) {
                return bytes;
            }
        }

        let encoded_subject = match &msg.subject {
            Some(s) if !s.is_empty() => {
                let b64 = base64::engine::general_purpose::STANDARD.encode(s.as_bytes());
                format!("=?UTF-8?B?{b64}?=")
            }
            _ => "(No Subject)".to_string(),
        };
        let date_header = msg.mail_created_at.to_rfc2822();
        let to_str = if to_recipients.is_empty() {
            msg.sender.clone()
        } else {
            to_recipients.join(", ")
        };
        let msg_id = msg
            .message_id_header
            .clone()
            .unwrap_or_else(|| format!("<{}@lemail.local>", msg.id));

        format!(
            "From: {}\r\nTo: {to_str}\r\nSubject: {encoded_subject}\r\nDate: {date_header}\r\nMessage-ID: {msg_id}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n(Message content unavailable)\r\n",
            msg.sender
        )
        .into_bytes()
    }

    fn parse_body_section(item: &str) -> (String, Option<usize>, Option<usize>) {
        let open = match item.find('[') {
            Some(i) => i,
            None => return (String::new(), None, None),
        };
        let close = match item[open + 1..].find(']') {
            Some(rel) => open + 1 + rel,
            None => return (String::new(), None, None),
        };
        let section = item[open + 1..close].trim().to_string();
        let rest = &item[close + 1..];

        let (mut offset, mut length) = (None, None);
        if let Some(lt) = rest.find('<') {
            if let Some(gt) = rest[lt + 1..].find('>') {
                let inner = &rest[lt + 1..lt + 1 + gt];
                if let Some((a, b)) = inner.split_once('.') {
                    offset = a.parse::<usize>().ok();
                    length = b.parse::<usize>().ok();
                } else {
                    offset = inner.parse::<usize>().ok();
                }
            }
        }
        (section, offset, length)
    }

    fn extract_paren_fields(section: &str) -> Vec<String> {
        let Some(open) = section.find('(') else {
            return Vec::new();
        };
        let Some(close) = section[open + 1..].find(')') else {
            return Vec::new();
        };
        section[open + 1..open + 1 + close]
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect()
    }

    /// IMAP FETCH 아이템 파싱 (대괄호 및 내부 괄호 유지)
    pub fn parse_fetch_items(raw: &str) -> Vec<String> {
        let mut s = raw.trim();
        if s.starts_with('(') && s.ends_with(')') {
            s = s[1..s.len() - 1].trim();
        }

        let bytes = s.as_bytes();
        let mut items = Vec::new();
        let mut i = 0;

        while i < bytes.len() {
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i >= bytes.len() {
                break;
            }

            let start = i;
            let rest = &s[i..];
            let upper_rest = rest.to_ascii_uppercase();
            let is_body = upper_rest.starts_with("BODY.PEEK[") || upper_rest.starts_with("BODY[");

            if is_body {
                let mut depth = 0usize;
                let mut j = i;
                while j < bytes.len() {
                    if bytes[j] == b'[' {
                        depth += 1;
                    } else if bytes[j] == b']' {
                        depth = depth.saturating_sub(1);
                        if depth == 0 {
                            j += 1;
                            if j < bytes.len() && bytes[j] == b'<' {
                                if let Some(rel) = s[j..].find('>') {
                                    j += rel + 1;
                                }
                            }
                            break;
                        }
                    }
                    j += 1;
                }
                items.push(s[start..j].to_string());
                i = j;
            } else {
                while i < bytes.len() && !bytes[i].is_ascii_whitespace() {
                    i += 1;
                }
                items.push(s[start..i].to_string());
            }
        }

        items
    }

    pub fn extract_header(raw_eml: &[u8]) -> &[u8] {
        if let Some(pos) = find_subslice(raw_eml, b"\r\n\r\n") {
            return &raw_eml[..pos + 4];
        }
        if let Some(pos) = find_subslice(raw_eml, b"\n\n") {
            return &raw_eml[..pos + 2];
        }
        raw_eml
    }

    pub fn extract_header_fields(raw_eml: &[u8], fields: &[String], not_fields: bool) -> Vec<u8> {
        let header_buf = Self::extract_header(raw_eml);
        let header_str = String::from_utf8_lossy(header_buf);

        let mut headers: Vec<String> = Vec::new();
        let mut current = String::new();

        for line in header_str.lines() {
            let line = line.trim_end_matches('\r');
            if line.starts_with(' ') || line.starts_with('\t') {
                if !current.is_empty() {
                    current.push_str("\r\n");
                    current.push_str(line);
                }
            } else {
                if !current.is_empty() {
                    headers.push(std::mem::take(&mut current));
                }
                current = line.to_string();
            }
        }
        if !current.trim().is_empty() {
            headers.push(current);
        }

        let field_set: HashSet<String> = fields.iter().map(|f| f.to_ascii_uppercase()).collect();
        let filtered: Vec<String> = headers
            .into_iter()
            .filter(|h| {
                let Some(colon) = h.find(':') else {
                    return false;
                };
                let name = h[..colon].trim().to_ascii_uppercase();
                let matches = field_set.contains(&name);
                if not_fields { !matches } else { matches }
            })
            .collect();

        let mut out = filtered.join("\r\n");
        out.push_str("\r\n\r\n");
        out.into_bytes()
    }

    pub fn extract_text(raw_eml: &[u8]) -> &[u8] {
        if let Some(pos) = find_subslice(raw_eml, b"\r\n\r\n") {
            return &raw_eml[pos + 4..];
        }
        if let Some(pos) = find_subslice(raw_eml, b"\n\n") {
            return &raw_eml[pos + 2..];
        }
        &[]
    }

    pub fn resolve_raw_file_path(raw_file_path: &str) -> Option<PathBuf> {
        if raw_file_path.is_empty() {
            return None;
        }
        let direct = PathBuf::from(raw_file_path);
        if direct.is_file() {
            return Some(direct);
        }

        let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let from_cwd = cwd.join(raw_file_path);
        if from_cwd.is_file() {
            return Some(from_cwd);
        }

        let normalized = raw_file_path.replace('\\', "/");
        if let Some(idx) = normalized.find("mail-archive/") {
            let sub_path = &normalized[idx..];
            let candidates = [
                cwd.join(sub_path),
                cwd.join("../apps/api").join(sub_path),
                cwd.join("../../apps/api").join(sub_path),
                cwd.join("../imap").join(sub_path),
                cwd.join("../../services/imap").join(sub_path),
            ];
            for c in candidates {
                if c.is_file() {
                    return Some(c);
                }
            }
        }

        let file_name = Path::new(raw_file_path)
            .file_name()
            .and_then(|n| n.to_str())?;
        if file_name.ends_with(".eml") {
            let search_dirs = [
                cwd.join("mail-archive"),
                cwd.join("../apps/api/mail-archive"),
                cwd.join("../../apps/api/mail-archive"),
                cwd.join("../imap/mail-archive"),
            ];
            for dir in search_dirs {
                if dir.is_dir() {
                    if let Some(found) = Self::find_file_recursively(&dir, file_name, 4) {
                        return Some(found);
                    }
                }
            }
        }

        None
    }

    fn find_file_recursively(dir: &Path, target: &str, max_depth: usize) -> Option<PathBuf> {
        if max_depth == 0 {
            return None;
        }
        let entries = fs::read_dir(dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && entry.file_name().to_str() == Some(target) {
                return Some(path);
            } else if path.is_dir() {
                if let Some(found) = Self::find_file_recursively(&path, target, max_depth - 1) {
                    return Some(found);
                }
            }
        }
        None
    }

    pub async fn handle_store(
        session: &mut ClientSession,
        tag: &str,
        sequence_set: &str,
        action: &str,
        flags_raw: &str,
        is_uid: bool,
    ) -> io::Result<()> {
        let (Some(user), Some(mailbox)) = (
            session.user().cloned(),
            session.selected_mailbox().cloned(),
        ) else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Select a mailbox first",
                    None,
                ))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let messages = Self::get_mailbox_messages(&db, &user.id, &mailbox.id, true).await;
        let prefix = if is_uid { "UID " } else { "" };

        if messages.is_empty() {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "OK",
                    &format!("{prefix}STORE completed"),
                    None,
                ))
                .await?;
            return Ok(());
        }

        let max_val = if is_uid {
            messages.last().map(|m| m.uid).unwrap_or(0)
        } else {
            messages.len() as u32
        };
        let requested_set: HashSet<u32> = ImapUtils::parse_sequence_set(sequence_set, max_val)
            .into_iter()
            .collect();

        let upper_action = action.to_ascii_uppercase();
        let is_silent = upper_action.ends_with(".SILENT");
        let base_action = upper_action.trim_end_matches(".SILENT");

        let upper_flags = flags_raw.to_ascii_uppercase();
        let has_seen = upper_flags.contains("\\SEEN");
        let has_flagged = upper_flags.contains("\\FLAGGED");
        let has_deleted = upper_flags.contains("\\DELETED");
        let has_answered = upper_flags.contains("\\ANSWERED");
        let has_draft = upper_flags.contains("\\DRAFT");

        for mut msg in messages
            .into_iter()
            .filter(|m| requested_set.contains(&if is_uid { m.uid } else { m.seq }))
        {
            match base_action {
                "FLAGS" => {
                    msg.is_read = has_seen;
                    msg.is_starred = has_flagged;
                    msg.is_deleted = has_deleted;
                    msg.is_answered = has_answered;
                    msg.is_draft = has_draft;
                }
                "+FLAGS" => {
                    if has_seen { msg.is_read = true; }
                    if has_flagged { msg.is_starred = true; }
                    if has_deleted { msg.is_deleted = true; }
                    if has_answered { msg.is_answered = true; }
                    if has_draft { msg.is_draft = true; }
                }
                "-FLAGS" => {
                    if has_seen { msg.is_read = false; }
                    if has_flagged { msg.is_starred = false; }
                    if has_deleted { msg.is_deleted = false; }
                    if has_answered { msg.is_answered = false; }
                    if has_draft { msg.is_draft = false; }
                }
                _ => {}
            }

            let _ = sqlx::query(
                "UPDATE user_mail \
                 SET is_read = ?, is_starred = ?, is_deleted = ?, is_answered = ?, is_draft = ? \
                 WHERE id = ?",
            )
            .bind(msg.is_read)
            .bind(msg.is_starred)
            .bind(msg.is_deleted)
            .bind(msg.is_answered)
            .bind(msg.is_draft)
            .bind(&msg.id)
            .execute(db.pool())
            .await;

            if !is_silent {
                session
                    .write_str(&format!(
                        "* {} FETCH (FLAGS {} UID {})\r\n",
                        msg.seq,
                        ImapUtils::format_flags(msg.flags()),
                        msg.uid
                    ))
                    .await?;
            }
        }

        session
            .write_str(&ImapResponse::tagged(
                tag,
                "OK",
                &format!("{prefix}STORE completed"),
                None,
            ))
            .await?;
        Ok(())
    }

    pub async fn handle_search(
        session: &mut ClientSession,
        tag: &str,
        criteria_tokens: &[String],
        is_uid: bool,
    ) -> io::Result<()> {
        let (Some(user), Some(mailbox)) = (
            session.user().cloned(),
            session.selected_mailbox().cloned(),
        ) else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Select a mailbox first",
                    None,
                ))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let messages = Self::get_mailbox_messages(&db, &user.id, &mailbox.id, true).await;
        let max_uid = messages.last().map(|m| m.uid).unwrap_or(0);

        let upper_tokens: Vec<String> = criteria_tokens
            .iter()
            .map(|t| {
                t.chars()
                    .filter(|&c| c != '(' && c != ')')
                    .collect::<String>()
                    .to_uppercase()
            })
            .collect();

        let mut result_ids: Vec<String> = Vec::new();

        for msg in &messages {
            let mut matched = true;
            let mut i = 0;

            while i < upper_tokens.len() {
                match upper_tokens[i].as_str() {
                    "ALL" => {}
                    "UNSEEN" => if msg.is_read { matched = false; },
                    "SEEN" => if !msg.is_read { matched = false; },
                    "FLAGGED" => if !msg.is_starred { matched = false; },
                    "UNFLAGGED" => if msg.is_starred { matched = false; },
                    "DELETED" => if !msg.is_deleted { matched = false; },
                    "UNDELETED" => if msg.is_deleted { matched = false; },
                    "ANSWERED" => if !msg.is_answered { matched = false; },
                    "UNANSWERED" => if msg.is_answered { matched = false; },
                    "DRAFT" => if !msg.is_draft { matched = false; },
                    "UNDRAFT" => if msg.is_draft { matched = false; },
                    "SUBJECT" => {
                        i += 1;
                        let val = upper_tokens.get(i).map(|s| s.as_str()).unwrap_or("");
                        let subj_match = msg
                            .subject
                            .as_deref()
                            .map(|s| s.to_uppercase().contains(val))
                            .unwrap_or(false);
                        if !subj_match {
                            matched = false;
                        }
                    }
                    "FROM" => {
                        i += 1;
                        let val = upper_tokens.get(i).map(|s| s.as_str()).unwrap_or("");
                        if !msg.sender.to_uppercase().contains(val) {
                            matched = false;
                        }
                    }
                    "UID" => {
                        i += 1;
                        let uid_set = upper_tokens.get(i).map(|s| s.as_str()).unwrap_or("");
                        let uids = ImapUtils::parse_sequence_set(uid_set, max_uid);
                        if !uids.contains(&msg.uid) {
                            matched = false;
                        }
                    }
                    _ => {}
                }
                i += 1;
            }

            if matched {
                result_ids.push(if is_uid {
                    msg.uid.to_string()
                } else {
                    msg.seq.to_string()
                });
            }
        }

        session
            .write_str(&format!("* SEARCH {}\r\n", result_ids.join(" ")))
            .await?;
        let prefix = if is_uid { "UID " } else { "" };
        session
            .write_str(&ImapResponse::tagged(
                tag,
                "OK",
                &format!("{prefix}SEARCH completed"),
                None,
            ))
            .await?;
        Ok(())
    }

    pub async fn handle_expunge(session: &mut ClientSession, tag: &str) -> io::Result<()> {
        let (Some(user), Some(mailbox)) = (
            session.user().cloned(),
            session.selected_mailbox().cloned(),
        ) else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Select a mailbox first",
                    None,
                ))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let all_messages = Self::get_mailbox_messages(&db, &user.id, &mailbox.id, true).await;
        let to_expunge: Vec<EnrichedUserMail> =
            all_messages.into_iter().filter(|m| m.is_deleted).collect();

        let mut shift = 0u32;
        for msg in to_expunge {
            let expunged_seq = msg.seq.saturating_sub(shift);
            let _ = sqlx::query("DELETE FROM user_mail WHERE id = ?")
                .bind(&msg.id)
                .execute(db.pool())
                .await;
            session
                .write_str(&format!("* {expunged_seq} EXPUNGE\r\n"))
                .await?;
            shift += 1;
        }

        session
            .write_str(&ImapResponse::tagged(tag, "OK", "EXPUNGE completed", None))
            .await?;
        Ok(())
    }

    pub async fn handle_copy_move(
        session: &mut ClientSession,
        tag: &str,
        sequence_set: &str,
        target_mailbox_name: &str,
        is_move: bool,
        is_uid: bool,
    ) -> io::Result<()> {
        let (Some(user), Some(mailbox)) = (
            session.user().cloned(),
            session.selected_mailbox().cloned(),
        ) else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Select a mailbox first",
                    None,
                ))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let Some(mut target_folder) =
            FolderHandler::resolve_folder(&db, &user.id, target_mailbox_name).await
        else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    &format!("Target mailbox does not exist: {target_mailbox_name}"),
                    None,
                ))
                .await?;
            return Ok(());
        };

        let messages = Self::get_mailbox_messages(&db, &user.id, &mailbox.id, false).await;
        let prefix = if is_uid { "UID " } else { "" };
        let op = if is_move { "MOVE" } else { "COPY" };

        if messages.is_empty() {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "OK",
                    &format!("{prefix}{op} completed"),
                    None,
                ))
                .await?;
            return Ok(());
        }

        let max_val = if is_uid {
            messages.last().map(|m| m.uid).unwrap_or(0)
        } else {
            messages.len() as u32
        };
        let requested_set: HashSet<u32> = ImapUtils::parse_sequence_set(sequence_set, max_val)
            .into_iter()
            .collect();

        for msg in messages
            .into_iter()
            .filter(|m| requested_set.contains(&if is_uid { m.uid } else { m.seq }))
        {
            let allocated_uid = target_folder.uidnext.max(1);
            target_folder.uidnext = allocated_uid + 1;

            let _ = sqlx::query("UPDATE mail_folder SET uidnext = ? WHERE id = ?")
                .bind(target_folder.uidnext)
                .bind(&target_folder.id)
                .execute(db.pool())
                .await;

            if is_move {
                let _ = sqlx::query("UPDATE user_mail SET folder_id = ?, uid = ? WHERE id = ?")
                    .bind(&target_folder.id)
                    .bind(allocated_uid)
                    .bind(&msg.id)
                    .execute(db.pool())
                    .await;
            } else {
                let _ = sqlx::query(
                    "INSERT INTO user_mail (id, user_id, folder_id, message_id, uid, is_read, is_starred, is_deleted, is_answered, is_draft, created_at) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                )
                .bind(Uuid::new_v4().to_string())
                .bind(&user.id)
                .bind(&target_folder.id)
                .bind(&msg.message_id)
                .bind(allocated_uid)
                .bind(msg.is_read)
                .bind(msg.is_starred)
                .bind(msg.is_deleted)
                .bind(msg.is_answered)
                .bind(msg.is_draft)
                .execute(db.pool())
                .await;
            }
        }

        session
            .write_str(&ImapResponse::tagged(
                tag,
                "OK",
                &format!("{prefix}{op} completed"),
                None,
            ))
            .await?;
        Ok(())
    }
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_fetch_items() {
        let items = MessageHandler::parse_fetch_items(
            "(UID RFC822.SIZE BODY.PEEK[HEADER.FIELDS (From To Subject)] BODY.PEEK[]<0.1024>)",
        );
        assert_eq!(
            items,
            vec![
                "UID",
                "RFC822.SIZE",
                "BODY.PEEK[HEADER.FIELDS (From To Subject)]",
                "BODY.PEEK[]<0.1024>"
            ]
        );
    }

    #[test]
    fn test_extract_header_fields_and_text() {
        let raw = b"From: alice@test.com\r\nTo: bob@test.com\r\nSubject: Hello\r\n Continued\r\nX-Custom: 123\r\n\r\nBody line 1\r\n";
        let fields = vec!["From".to_string(), "Subject".to_string()];
        let extracted = MessageHandler::extract_header_fields(raw, &fields, false);
        let s = String::from_utf8(extracted).unwrap();
        assert!(s.contains("From: alice@test.com"));
        assert!(s.contains("Subject: Hello\r\n Continued"));
        assert!(!s.contains("X-Custom"));

        let text = MessageHandler::extract_text(raw);
        assert_eq!(text, b"Body line 1\r\n");
    }
}
