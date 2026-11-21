use crate::protocol::response::ImapResponse;
use crate::server::client_session::{ClientSession, SelectedMailbox};
use crate::services::db::DbService;
use crate::utils::imap_utils::ImapUtils;
use sqlx::Row;
use std::collections::{HashMap, HashSet};
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct FolderRow {
    pub id: String,
    pub user_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub folder_type: String,
    pub sort_order: i32,
    pub is_system: bool,
    pub uidvalidity: u32,
    pub uidnext: u32,
}

#[derive(Debug, Clone)]
pub struct EnrichedFolder {
    pub row: FolderRow,
    pub full_path: String,
    pub encoded_path: String,
    pub has_children: bool,
}

pub struct FolderHandler;

impl FolderHandler {
    fn row_from_mysql(r: &sqlx::mysql::MySqlRow) -> FolderRow {
        FolderRow {
            id: r.try_get("id").unwrap_or_default(),
            user_id: r.try_get("user_id").unwrap_or_default(),
            parent_id: r.try_get("parent_id").ok().flatten(),
            name: r.try_get("name").unwrap_or_default(),
            folder_type: r.try_get("type").unwrap_or_else(|_| "CUSTOM".to_string()),
            sort_order: r.try_get("sort_order").unwrap_or(0),
            is_system: r.try_get("is_system").unwrap_or(false),
            uidvalidity: r.try_get("uidvalidity").unwrap_or(1),
            uidnext: r.try_get("uidnext").unwrap_or(1),
        }
    }

    fn get_imap_folder_name(folder: &FolderRow) -> String {
        match folder.folder_type.as_str() {
            "INBOX" => "INBOX".to_string(),
            "SENT" => "보낸 편지함".to_string(),
            "DRAFTS" => "임시 보관함".to_string(),
            "TRASH" => "지운 편지함".to_string(),
            "SPAM" => "정크 메일".to_string(),
            _ => {
                if folder.is_system && folder.name == "개인편지함" {
                    "개인 편지함".to_string()
                } else {
                    folder.name.clone()
                }
            }
        }
    }

    pub fn get_enriched_folders(folders: &[FolderRow]) -> Vec<EnrichedFolder> {
        let mut folder_map: HashMap<&str, &FolderRow> = HashMap::new();
        let mut children_count: HashMap<&str, usize> = HashMap::new();

        for f in folders {
            folder_map.insert(f.id.as_str(), f);
            if let Some(pid) = f.parent_id.as_deref() {
                *children_count.entry(pid).or_insert(0) += 1;
            }
        }

        folders
            .iter()
            .map(|f| {
                let mut segments = Vec::new();
                let mut curr: Option<&FolderRow> = Some(f);
                let mut visited = HashSet::new();

                while let Some(node) = curr {
                    if !visited.insert(node.id.as_str()) {
                        break;
                    }
                    segments.push(Self::get_imap_folder_name(node));
                    curr = node
                        .parent_id
                        .as_deref()
                        .and_then(|pid| folder_map.get(pid).copied());
                }
                segments.reverse();

                let full_path = segments.join("/");
                let encoded_path = segments
                    .iter()
                    .map(|seg| {
                        if seg == "INBOX" {
                            "INBOX".to_string()
                        } else {
                            ImapUtils::encode_modified_utf7(seg)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("/");
                let has_children = children_count.get(f.id.as_str()).copied().unwrap_or(0) > 0;

                EnrichedFolder {
                    row: f.clone(),
                    full_path,
                    encoded_path,
                    has_children,
                }
            })
            .collect()
    }

    pub async fn resolve_folder(db: &DbService, user_id: &str, mailbox_name: &str) -> Option<FolderRow> {
        let raw_clean = strip_quotes(mailbox_name).trim();
        let decoded_name = ImapUtils::decode_modified_utf7(raw_clean).trim().to_string();
        let clean_normalized: String = decoded_name.chars().filter(|c| !c.is_whitespace()).collect();
        let upper = clean_normalized.to_uppercase();

        let target_type: Option<&str> = if upper == "INBOX" || clean_normalized == "받은편지함" {
            Some("INBOX")
        } else if matches!(
            upper.as_str(),
            "SENT" | "SENTITEMS" | "SENTMESSAGES"
        ) || clean_normalized == "보낸편지함"
        {
            Some("SENT")
        } else if matches!(upper.as_str(), "DRAFTS" | "DRAFT")
            || clean_normalized == "임시보관함"
            || clean_normalized == "임시편지함"
        {
            Some("DRAFTS")
        } else if matches!(
            upper.as_str(),
            "TRASH" | "DELETED" | "DELETEDITEMS" | "DELETEDMESSAGES"
        ) || matches!(clean_normalized.as_str(), "휴지통" | "지운편지함" | "지운항목")
        {
            Some("TRASH")
        } else if matches!(
            upper.as_str(),
            "JUNK" | "SPAM" | "JUNKEMAIL" | "JUNKE-MAIL"
        ) || matches!(clean_normalized.as_str(), "스팸메일함" | "스팸메일" | "정크메일")
        {
            Some("SPAM")
        } else {
            None
        };

        if let Some(t) = target_type {
            if let Ok(Some(row)) = sqlx::query(
                "SELECT id, user_id, parent_id, name, `type`, sort_order, is_system, uidvalidity, uidnext \
                 FROM mail_folder WHERE user_id = ? AND `type` = ? LIMIT 1",
            )
            .bind(user_id)
            .bind(t)
            .fetch_optional(db.pool())
            .await
            {
                return Some(Self::row_from_mysql(&row));
            }
        }

        let rows = sqlx::query(
            "SELECT id, user_id, parent_id, name, `type`, sort_order, is_system, uidvalidity, uidnext \
             FROM mail_folder WHERE user_id = ?",
        )
        .bind(user_id)
        .fetch_all(db.pool())
        .await
        .ok()?;

        let all_folders: Vec<FolderRow> = rows.iter().map(Self::row_from_mysql).collect();
        let enriched = Self::get_enriched_folders(&all_folders);

        let decoded_lower = decoded_name.to_lowercase();
        let raw_lower = raw_clean.to_lowercase();

        for f in &enriched {
            if f.full_path.to_lowercase() == decoded_lower
                || f.encoded_path.to_lowercase() == raw_lower
                || f.encoded_path.to_lowercase() == decoded_lower
            {
                return Some(f.row.clone());
            }
        }

        let leaf_name = decoded_name
            .rsplit('/')
            .next()
            .unwrap_or(&decoded_name)
            .trim()
            .to_lowercase();

        for f in &enriched {
            let name_lower = f.row.name.to_lowercase();
            if name_lower == leaf_name || name_lower == decoded_lower {
                return Some(f.row.clone());
            }
        }

        None
    }

    pub async fn handle_list(
        session: &mut ClientSession,
        tag: &str,
        reference: &str,
        pattern: &str,
        is_special_use: bool,
    ) -> io::Result<()> {
        Self::handle_list_or_lsub(session, tag, reference, pattern, is_special_use, "LIST").await
    }

    pub async fn handle_lsub(
        session: &mut ClientSession,
        tag: &str,
        reference: &str,
        pattern: &str,
        is_special_use: bool,
    ) -> io::Result<()> {
        Self::handle_list_or_lsub(session, tag, reference, pattern, is_special_use, "LSUB").await
    }

    async fn handle_list_or_lsub(
        session: &mut ClientSession,
        tag: &str,
        reference: &str,
        pattern: &str,
        is_special_use: bool,
        cmd_name: &str,
    ) -> io::Result<()> {
        let Some(user) = session.user().cloned() else {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Authenticate first", None))
                .await?;
            return Ok(());
        };

        let clean_ref = strip_quotes(reference).trim();
        let clean_pattern = strip_quotes(pattern).trim();

        if clean_ref.is_empty() && clean_pattern.is_empty() {
            session
                .write_str(&format!("* {cmd_name} (\\Noselect) \"/\" \"\"\r\n"))
                .await?;
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "OK",
                    &format!("{cmd_name} completed"),
                    None,
                ))
                .await?;
            return Ok(());
        }

        let db = session.ctx().db.clone();
        let rows = sqlx::query(
            "SELECT id, user_id, parent_id, name, `type`, sort_order, is_system, uidvalidity, uidnext \
             FROM mail_folder WHERE user_id = ? ORDER BY sort_order ASC, name ASC",
        )
        .bind(&user.id)
        .fetch_all(db.pool())
        .await
        .unwrap_or_default();

        let folders: Vec<FolderRow> = rows.iter().map(Self::row_from_mysql).collect();
        let enriched = Self::get_enriched_folders(&folders);

        let decoded_ref = ImapUtils::decode_modified_utf7(clean_ref);
        let decoded_pattern = ImapUtils::decode_modified_utf7(clean_pattern);

        for f in &enriched {
            if is_special_use && f.row.folder_type == "CUSTOM" {
                continue;
            }

            let matches = clean_pattern == "*"
                || clean_pattern.is_empty()
                || Self::matches_pattern(&f.full_path, &decoded_pattern, &decoded_ref)
                || Self::matches_pattern(&f.encoded_path, clean_pattern, clean_ref)
                || Self::matches_pattern(&f.full_path, clean_pattern, clean_ref);

            if !matches {
                continue;
            }

            let attrs = Self::get_folder_attributes(f);
            session
                .write_str(&format!(
                    "* {cmd_name} ({}) \"/\" \"{}\"\r\n",
                    attrs.join(" "),
                    f.encoded_path
                ))
                .await?;
        }

        session
            .write_str(&ImapResponse::tagged(
                tag,
                "OK",
                &format!("{cmd_name} completed"),
                None,
            ))
            .await?;
        Ok(())
    }

    pub async fn handle_status(
        session: &mut ClientSession,
        tag: &str,
        mailbox_name: &str,
        status_items: &[String],
    ) -> io::Result<()> {
        let Some(user) = session.user().cloned() else {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Authenticate first", None))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let Some(folder) = Self::resolve_folder(&db, &user.id, mailbox_name).await else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    &format!("Mailbox does not exist: {mailbox_name}"),
                    None,
                ))
                .await?;
            return Ok(());
        };

        let counts = sqlx::query(
            "SELECT \
               COUNT(CASE WHEN is_deleted = false THEN 1 END) AS messages, \
               COUNT(CASE WHEN is_read = false AND is_deleted = false THEN 1 END) AS unseen \
             FROM user_mail WHERE folder_id = ?",
        )
        .bind(&folder.id)
        .fetch_one(db.pool())
        .await;

        let (message_count, unseen_count) = match counts {
            Ok(r) => (
                r.try_get::<i64, _>("messages").unwrap_or(0),
                r.try_get::<i64, _>("unseen").unwrap_or(0),
            ),
            Err(_) => (0, 0),
        };

        let default_items = [
            "MESSAGES".to_string(),
            "RECENT".to_string(),
            "UIDNEXT".to_string(),
            "UIDVALIDITY".to_string(),
            "UNSEEN".to_string(),
        ];
        let items: &[String] = if status_items.is_empty() {
            &default_items
        } else {
            status_items
        };

        let mut parts = Vec::new();
        for item in items {
            let upper: String = item
                .chars()
                .filter(|&c| c != '(' && c != ')')
                .collect::<String>()
                .to_ascii_uppercase();
            match upper.as_str() {
                "MESSAGES" => parts.push(format!("MESSAGES {message_count}")),
                "RECENT" => parts.push("RECENT 0".to_string()),
                "UIDNEXT" => parts.push(format!("UIDNEXT {}", folder.uidnext.max(1))),
                "UIDVALIDITY" => parts.push(format!("UIDVALIDITY {}", folder.uidvalidity.max(1))),
                "UNSEEN" => parts.push(format!("UNSEEN {unseen_count}")),
                _ => {}
            }
        }

        let clean_mailbox = strip_quotes(mailbox_name);
        session
            .write_str(&format!(
                "* STATUS \"{clean_mailbox}\" ({})\r\n",
                parts.join(" ")
            ))
            .await?;
        session
            .write_str(&ImapResponse::tagged(tag, "OK", "STATUS completed", None))
            .await?;
        Ok(())
    }

    pub async fn handle_select(
        session: &mut ClientSession,
        tag: &str,
        mailbox_name: &str,
        is_examine: bool,
    ) -> io::Result<()> {
        let Some(user) = session.user().cloned() else {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Authenticate first", None))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let Some(folder) = Self::resolve_folder(&db, &user.id, mailbox_name).await else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    &format!("Mailbox does not exist: {mailbox_name}"),
                    None,
                ))
                .await?;
            return Ok(());
        };

        let counts = sqlx::query(
            "SELECT \
               COUNT(CASE WHEN is_deleted = false THEN 1 END) AS messages, \
               COUNT(CASE WHEN is_read = false AND is_deleted = false THEN 1 END) AS unseen \
             FROM user_mail WHERE folder_id = ?",
        )
        .bind(&folder.id)
        .fetch_one(db.pool())
        .await;

        let (message_count, unseen_count) = match counts {
            Ok(r) => (
                r.try_get::<i64, _>("messages").unwrap_or(0),
                r.try_get::<i64, _>("unseen").unwrap_or(0),
            ),
            Err(_) => (0, 0),
        };

        session
            .write_str(&format!("* {message_count} EXISTS\r\n* 0 RECENT\r\n"))
            .await?;

        if unseen_count > 0 {
            let first_seq: u64 = sqlx::query_scalar::<_, u64>(
                "SELECT seq FROM ( \
                   SELECT id, is_read, ROW_NUMBER() OVER (ORDER BY uid ASC) AS seq \
                   FROM user_mail WHERE folder_id = ? AND is_deleted = false \
                 ) t WHERE is_read = false LIMIT 1",
            )
            .bind(&folder.id)
            .fetch_optional(db.pool())
            .await
            .ok()
            .flatten()
            .unwrap_or(1);

            session
                .write_str(&format!("* OK [UNSEEN {first_seq}] First unseen message\r\n"))
                .await?;
        }

        session
            .write_str(&format!(
                "* OK [UIDVALIDITY {}] UIDs valid\r\n\
                 * OK [UIDNEXT {}] Predicted next UID\r\n\
                 * FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n\
                 * OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Permanent flags\r\n",
                folder.uidvalidity.max(1),
                folder.uidnext.max(1),
            ))
            .await?;

        session.set_selected_mailbox(Some(SelectedMailbox {
            id: folder.id.clone(),
            name: Self::get_folder_display_name(&folder),
            is_read_only: is_examine,
        }));

        let code = if is_examine { "READ-ONLY" } else { "READ-WRITE" };
        let cmd = if is_examine { "EXAMINE" } else { "SELECT" };
        session
            .write_str(&ImapResponse::tagged(
                tag,
                "OK",
                &format!("{cmd} completed"),
                Some(code),
            ))
            .await?;
        Ok(())
    }

    pub async fn handle_create(
        session: &mut ClientSession,
        tag: &str,
        mailbox_name: &str,
    ) -> io::Result<()> {
        let Some(user) = session.user().cloned() else {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Authenticate first", None))
                .await?;
            return Ok(());
        };

        let clean_name = strip_quotes(mailbox_name).trim();
        let decoded_name = ImapUtils::decode_modified_utf7(clean_name)
            .trim()
            .trim_end_matches('/')
            .trim()
            .to_string();
        if decoded_name.is_empty() || decoded_name.eq_ignore_ascii_case("INBOX") {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Cannot create INBOX", None))
                .await?;
            return Ok(());
        }

        let db = session.ctx().db.clone();
        if Self::resolve_folder(&db, &user.id, &decoded_name)
            .await
            .is_some()
        {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Mailbox already exists",
                    Some("ALREADYEXISTS"),
                ))
                .await?;
            return Ok(());
        }

        let mut parent_id: Option<String> = None;
        let mut leaf_name = decoded_name.clone();

        if let Some(last_slash) = decoded_name.rfind('/') {
            let parent_path = decoded_name[..last_slash].trim();
            leaf_name = decoded_name[last_slash + 1..].trim().to_string();
            if let Some(parent_folder) = Self::resolve_folder(&db, &user.id, parent_path).await {
                parent_id = Some(parent_folder.id);
            }
        }

        // 상위 편지함이 지정되지 않았거나 찾지 못한 경우, 웹메일(MailFolderService)과 동일하게
        // '개인편지함(CUSTOM, is_system=1)' 루트 하위로 자동 연결하여 웹/모바일에 동기화되도록 보장
        if parent_id.is_none() {
            if let Ok(Some(row)) = sqlx::query(
                "SELECT id FROM mail_folder WHERE user_id = ? AND `type` = 'CUSTOM' AND is_system = 1 LIMIT 1",
            )
            .bind(&user.id)
            .fetch_optional(db.pool())
            .await
            {
                parent_id = row.try_get::<String, _>("id").ok();
            }
        }

        info!(
            "[FolderHandler] CREATE raw=\"{}\" decoded=\"{}\" leaf=\"{}\" parent_id={:?} user={}",
            mailbox_name, decoded_name, leaf_name, parent_id, user.email
        );

        let folder_id = Uuid::new_v4().to_string();
        let now_seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as u32)
            .unwrap_or(1);

        let res = sqlx::query(
            "INSERT INTO mail_folder (id, user_id, parent_id, name, `type`, sort_order, is_system, uidvalidity, uidnext, created_at, updated_at) \
             VALUES (?, ?, ?, ?, 'CUSTOM', 10, 0, ?, 1, NOW(), NOW())",
        )
        .bind(&folder_id)
        .bind(&user.id)
        .bind(&parent_id)
        .bind(&leaf_name)
        .bind(now_seconds)
        .execute(db.pool())
        .await;

        match res {
            Ok(_) => {
                session
                    .write_str(&ImapResponse::tagged(tag, "OK", "CREATE completed", None))
                    .await?;
            }
            Err(e) => {
                warn!("[FolderHandler] CREATE DB error: {}", e);
                session
                    .write_str(&ImapResponse::tagged(
                        tag,
                        "NO",
                        &format!("CREATE failed: {e}"),
                        None,
                    ))
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn handle_delete(
        session: &mut ClientSession,
        tag: &str,
        mailbox_name: &str,
    ) -> io::Result<()> {
        let Some(user) = session.user().cloned() else {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Authenticate first", None))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let Some(folder) = Self::resolve_folder(&db, &user.id, mailbox_name).await else {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Mailbox does not exist", None))
                .await?;
            return Ok(());
        };

        if folder.is_system || folder.folder_type != "CUSTOM" {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Cannot delete system mailboxes",
                    None,
                ))
                .await?;
            return Ok(());
        }

        let _ = sqlx::query("DELETE FROM mail_folder WHERE id = ?")
            .bind(&folder.id)
            .execute(db.pool())
            .await;

        session
            .write_str(&ImapResponse::tagged(tag, "OK", "DELETE completed", None))
            .await?;
        Ok(())
    }

    pub async fn handle_rename(
        session: &mut ClientSession,
        tag: &str,
        old_name: &str,
        new_name: &str,
    ) -> io::Result<()> {
        let Some(user) = session.user().cloned() else {
            session
                .write_str(&ImapResponse::tagged(tag, "NO", "Authenticate first", None))
                .await?;
            return Ok(());
        };

        let db = session.ctx().db.clone();
        let Some(folder) = Self::resolve_folder(&db, &user.id, old_name).await else {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Source mailbox does not exist",
                    None,
                ))
                .await?;
            return Ok(());
        };

        if folder.is_system || folder.folder_type != "CUSTOM" {
            session
                .write_str(&ImapResponse::tagged(
                    tag,
                    "NO",
                    "Cannot rename system mailboxes",
                    None,
                ))
                .await?;
            return Ok(());
        }

        let clean_new = strip_quotes(new_name).trim();
        let decoded_new = ImapUtils::decode_modified_utf7(clean_new).trim().to_string();
        let new_leaf = decoded_new
            .rsplit('/')
            .next()
            .unwrap_or(&decoded_new)
            .trim()
            .to_string();

        let _ = sqlx::query("UPDATE mail_folder SET name = ?, updated_at = NOW() WHERE id = ?")
            .bind(&new_leaf)
            .bind(&folder.id)
            .execute(db.pool())
            .await;

        session
            .write_str(&ImapResponse::tagged(tag, "OK", "RENAME completed", None))
            .await?;
        Ok(())
    }

    pub fn matches_pattern(folder_path: &str, pattern: &str, reference: &str) -> bool {
        if pattern.is_empty() && reference.is_empty() {
            return false;
        }
        let full_pattern = if reference.is_empty() {
            pattern.to_string()
        } else if reference.ends_with('/') {
            format!("{reference}{pattern}")
        } else {
            format!("{reference}/{pattern}")
        };

        if full_pattern == "*" || full_pattern == "%*" {
            return true;
        }
        if full_pattern == "%" {
            return !folder_path.contains('/');
        }

        let p: Vec<char> = full_pattern.to_lowercase().chars().collect();
        let t: Vec<char> = folder_path.to_lowercase().chars().collect();
        imap_glob_match(&p, &t)
    }

    fn get_folder_display_name(folder: &FolderRow) -> String {
        let imap_name = Self::get_imap_folder_name(folder);
        if imap_name == "INBOX" {
            "INBOX".to_string()
        } else {
            ImapUtils::encode_modified_utf7(&imap_name)
        }
    }

    fn get_folder_attributes(folder: &EnrichedFolder) -> Vec<&'static str> {
        let mut attrs = Vec::new();
        match folder.row.folder_type.as_str() {
            "SENT" => attrs.push("\\Sent"),
            "DRAFTS" => attrs.push("\\Drafts"),
            "TRASH" => attrs.push("\\Trash"),
            "SPAM" => attrs.push("\\Junk"),
            "INBOX" => attrs.push("\\Inbox"),
            _ => {}
        }
        if folder.has_children {
            attrs.push("\\HasChildren");
        } else {
            attrs.push("\\HasNoChildren");
        }
        attrs
    }
}

fn strip_quotes(s: &str) -> &str {
    let trimmed = s.trim();
    if trimmed.len() >= 2
        && ((trimmed.starts_with('"') && trimmed.ends_with('"'))
            || (trimmed.starts_with('\'') && trimmed.ends_with('\'')))
    {
        return &trimmed[1..trimmed.len() - 1];
    }
    trimmed
}

/// IMAP LIST 와일드카드 매칭 (`*` = 모든 문자, `%` = `/` 제외 모든 문자)
fn imap_glob_match(pattern: &[char], text: &[char]) -> bool {
    let (m, n) = (pattern.len(), text.len());
    let mut dp = vec![vec![false; n + 1]; m + 1];
    dp[0][0] = true;

    for i in 1..=m {
        if pattern[i - 1] == '*' || pattern[i - 1] == '%' {
            dp[i][0] = dp[i - 1][0];
        }
    }

    for i in 1..=m {
        for j in 1..=n {
            dp[i][j] = match pattern[i - 1] {
                '*' => dp[i - 1][j] || dp[i][j - 1],
                '%' => dp[i - 1][j] || (text[j - 1] != '/' && dp[i][j - 1]),
                c => dp[i - 1][j - 1] && c == text[j - 1],
            };
        }
    }
    dp[m][n]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_imap_list_pattern_matching() {
        assert!(FolderHandler::matches_pattern("INBOX", "*", ""));
        assert!(FolderHandler::matches_pattern("Work/Sub", "*", ""));
        assert!(FolderHandler::matches_pattern("Work", "%", ""));
        assert!(!FolderHandler::matches_pattern("Work/Sub", "%", ""));
        assert!(FolderHandler::matches_pattern("Work/Sub", "%", "Work"));
        assert!(FolderHandler::matches_pattern("Work/Sub/Deep", "*", "Work"));
    }
}
