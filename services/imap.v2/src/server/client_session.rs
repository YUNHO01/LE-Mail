use crate::handlers::append::AppendHandler;
use crate::handlers::auth::AuthHandler;
use crate::handlers::folder::FolderHandler;
use crate::handlers::message::MessageHandler;
use crate::protocol::constants::{
    ImapState, CAPABILITIES_PLAIN, CAPABILITIES_SECURE, SERVER_NAME,
};
use crate::protocol::parser::{
    detect_trailing_literal, parse_command_line, sanitize_command_line, ImapAttr, ParsedCommand,
};
use crate::protocol::response::ImapResponse;
use crate::services::db::DbService;
use crate::services::license::ImapLicenseService;
use crate::services::redis::RedisService;
use crate::utils::imap_utils::ImapUtils;
use bytes::BytesMut;
use std::io;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf};
use tokio::net::TcpStream;
use tokio::sync::watch;
use tokio::time::timeout;
use tokio_rustls::server::TlsStream;
use tokio_rustls::TlsAcceptor;
use tracing::{info, warn};

/// 세션 전반에서 공유하는 인프라 서비스 컨텍스트
#[derive(Clone)]
pub struct AppContext {
    pub db: DbService,
    pub redis: RedisService,
    pub license: ImapLicenseService,
    pub archive_dir: PathBuf,
}

/// Plain TCP 스트림과 TLS 스트림을 단일 인터페이스로 추상화합니다.
pub enum ImapStream {
    Plain(TcpStream),
    Tls(Box<TlsStream<TcpStream>>),
}

impl AsyncRead for ImapStream {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        match self.get_mut() {
            ImapStream::Plain(s) => Pin::new(s).poll_read(cx, buf),
            ImapStream::Tls(s) => Pin::new(s.as_mut()).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for ImapStream {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        match self.get_mut() {
            ImapStream::Plain(s) => Pin::new(s).poll_write(cx, buf),
            ImapStream::Tls(s) => Pin::new(s.as_mut()).poll_write(cx, buf),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match self.get_mut() {
            ImapStream::Plain(s) => Pin::new(s).poll_flush(cx),
            ImapStream::Tls(s) => Pin::new(s.as_mut()).poll_flush(cx),
        }
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match self.get_mut() {
            ImapStream::Plain(s) => Pin::new(s).poll_shutdown(cx),
            ImapStream::Tls(s) => Pin::new(s.as_mut()).poll_shutdown(cx),
        }
    }
}

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub id: String,
    pub email: String,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct SelectedMailbox {
    pub id: String,
    pub name: String,
    pub is_read_only: bool,
}

pub struct ClientSession {
    pub id: String,
    ctx: AppContext,
    stream: Option<ImapStream>,
    is_tls: bool,
    enable_starttls: bool,
    tls_acceptor: Arc<TlsAcceptor>,
    auth_timeout: Duration,
    state: ImapState,
    user: Option<AuthenticatedUser>,
    selected_mailbox: Option<SelectedMailbox>,
    pending_auth: Option<(String, String)>, // (mechanism, tag)
    read_buf: BytesMut,
    shutdown_rx: watch::Receiver<bool>,
}

impl ClientSession {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: String,
        ctx: AppContext,
        stream: ImapStream,
        is_tls: bool,
        enable_starttls: bool,
        tls_acceptor: Arc<TlsAcceptor>,
        auth_timeout: Duration,
        shutdown_rx: watch::Receiver<bool>,
    ) -> Self {
        Self {
            id,
            ctx,
            stream: Some(stream),
            is_tls,
            enable_starttls,
            tls_acceptor,
            auth_timeout,
            state: ImapState::NotAuthenticated,
            user: None,
            selected_mailbox: None,
            pending_auth: None,
            read_buf: BytesMut::with_capacity(8192),
            shutdown_rx,
        }
    }

    pub fn ctx(&self) -> &AppContext {
        &self.ctx
    }

    pub fn state(&self) -> ImapState {
        self.state
    }

    pub fn user(&self) -> Option<&AuthenticatedUser> {
        self.user.as_ref()
    }

    pub fn set_user(&mut self, user: AuthenticatedUser) {
        self.user = Some(user);
        self.state = ImapState::Authenticated;
    }

    pub fn selected_mailbox(&self) -> Option<&SelectedMailbox> {
        self.selected_mailbox.as_ref()
    }

    pub fn set_selected_mailbox(&mut self, mailbox: Option<SelectedMailbox>) {
        self.state = if mailbox.is_some() {
            ImapState::Selected
        } else {
            ImapState::Authenticated
        };
        self.selected_mailbox = mailbox;
    }

    pub async fn run(mut self) {
        if let Err(e) = self.send_welcome().await {
            warn!("[ClientSession {}] Failed to send welcome: {}", self.id, e);
            return;
        }

        loop {
            if self.state == ImapState::Logout {
                break;
            }

            let line_opt = match self.read_line_with_timeout().await {
                Ok(Some(line)) => Some(line),
                Ok(None) => break, // EOF or shutdown
                Err(e) => {
                    warn!("[ClientSession {}] Read error: {}", self.id, e);
                    break;
                }
            };

            let raw_line = match line_opt {
                Some(l) if !l.is_empty() => l,
                _ => continue,
            };

            // AUTHENTICATE PLAIN continuation 대기 중일 때는 자격증명을 로그에 남기지 않음
            if let Some((mechanism, tag)) = self.pending_auth.take() {
                info!("[ClientSession {}] C: ******** (AUTH continuation)", self.id);
                if raw_line == "*" {
                    if let Err(e) = self
                        .write_str(&ImapResponse::tagged(
                            &tag,
                            "BAD",
                            "Authentication aborted",
                            None,
                        ))
                        .await
                    {
                        warn!("[ClientSession {}] Write error: {}", self.id, e);
                        break;
                    }
                    continue;
                }
                if mechanism == "PLAIN" {
                    if let Err(e) =
                        AuthHandler::handle_authenticate_plain(&mut self, &tag, &raw_line).await
                    {
                        warn!("[ClientSession {}] Auth error: {}", self.id, e);
                        break;
                    }
                }
                continue;
            }

            info!(
                "[ClientSession {}] C: {}",
                self.id,
                sanitize_command_line(&raw_line)
            );

            // 리터럴 데이터 수신 처리 (APPEND는 바이너리 본문, 그 외 명령어는 RFC 3501 문자열 리터럴 조합)
            let mut effective_line = raw_line;
            if let Some(literal_len) = detect_trailing_literal(&effective_line) {
                let first_parsed = parse_command_line(&effective_line);
                if first_parsed.command == "APPEND" {
                    let is_non_sync = effective_line.trim_end().ends_with("+}");
                    if !is_non_sync {
                        if let Err(e) = self
                            .write_str(&ImapResponse::continuation("Ready for literal data"))
                            .await
                        {
                            warn!("[ClientSession {}] Write error: {}", self.id, e);
                            break;
                        }
                    }
                    match self.read_exact_bytes(literal_len).await {
                        Ok(literal_data) => {
                            let header_without_lit = effective_line
                                .rfind('{')
                                .map(|i| effective_line[..i].trim())
                                .unwrap_or(&effective_line);
                            let tokens = ImapUtils::parse_search_criteria(header_without_lit);
                            let mailbox_name = tokens
                                .get(2)
                                .map(|s| s.as_str())
                                .unwrap_or("INBOX");
                            let flags_raw = if tokens.len() > 3 {
                                tokens[3..].join(" ")
                            } else {
                                String::new()
                            };
                            if let Err(e) = AppendHandler::handle_append(
                                &mut self,
                                &first_parsed.tag,
                                mailbox_name,
                                &flags_raw,
                                &literal_data,
                            )
                            .await
                            {
                                warn!("[ClientSession {}] APPEND error: {}", self.id, e);
                                break;
                            }
                        }
                        Err(e) => {
                            warn!("[ClientSession {}] Failed reading literal: {}", self.id, e);
                            break;
                        }
                    }
                    continue;
                } else {
                    // CREATE, SELECT, RENAME, DELETE, LOGIN 등의 문자열 리터럴 조합
                    let mut assembled = effective_line;
                    let mut literal_failed = false;
                    while let Some(lit_len) = detect_trailing_literal(&assembled) {
                        let is_non_sync = assembled.trim_end().ends_with("+}");
                        if !is_non_sync {
                            if let Err(e) = self
                                .write_str(&ImapResponse::continuation("Ready for literal data"))
                                .await
                            {
                                warn!("[ClientSession {}] Write error: {}", self.id, e);
                                literal_failed = true;
                                break;
                            }
                        }
                        let lit_bytes = match self.read_exact_bytes_raw(lit_len).await {
                            Ok(b) => b,
                            Err(e) => {
                                warn!("[ClientSession {}] Failed reading literal: {}", self.id, e);
                                literal_failed = true;
                                break;
                            }
                        };
                        let lit_str = String::from_utf8_lossy(&lit_bytes)
                            .replace('\\', "\\\\")
                            .replace('"', "\\\"");
                        let prefix = assembled
                            .rfind('{')
                            .map(|i| assembled[..i].trim_end())
                            .unwrap_or(&assembled);
                        let tail = match self.read_line_with_timeout().await {
                            Ok(Some(t)) => t,
                            Ok(None) => String::new(),
                            Err(e) => {
                                warn!("[ClientSession {}] Failed reading post-literal line: {}", self.id, e);
                                literal_failed = true;
                                break;
                            }
                        };
                        if tail.is_empty() {
                            assembled = format!("{prefix} \"{lit_str}\"");
                        } else {
                            assembled = format!("{prefix} \"{lit_str}\" {tail}");
                        }
                    }
                    if literal_failed {
                        break;
                    }
                    effective_line = assembled;
                }
            }

            let parsed = parse_command_line(&effective_line);
            if let Err(e) = self.dispatch_command(&parsed).await {
                warn!("[ClientSession {}] Dispatch error: {}", self.id, e);
                break;
            }
        }

        if let Some(mut s) = self.stream.take() {
            let _ = s.shutdown().await;
        }
        info!("[ClientSession {}] Connection closed", self.id);
    }

    async fn send_welcome(&mut self) -> io::Result<()> {
        let caps = self.current_capabilities();
        let cap_code = format!("CAPABILITY {}", caps.join(" "));
        let welcome = ImapResponse::untagged("OK", SERVER_NAME, Some(&cap_code));
        self.write_str(&welcome).await?;
        info!(
            "[ClientSession {}] Welcome banner sent (TLS: {})",
            self.id, self.is_tls
        );
        Ok(())
    }

    fn current_capabilities(&self) -> &'static [&'static str] {
        if self.is_tls || !self.enable_starttls {
            CAPABILITIES_SECURE
        } else {
            CAPABILITIES_PLAIN
        }
    }

    pub async fn write_str(&mut self, data: &str) -> io::Result<()> {
        self.write_bytes(data.as_bytes()).await
    }

    pub async fn write_bytes(&mut self, data: &[u8]) -> io::Result<()> {
        if let Some(stream) = self.stream.as_mut() {
            stream.write_all(data).await?;
            stream.flush().await?;
        }
        Ok(())
    }

    async fn read_line_with_timeout(&mut self) -> io::Result<Option<String>> {
        loop {
            if let Some(line) = self.extract_line_from_buf() {
                return Ok(Some(line));
            }

            let stream = match self.stream.as_mut() {
                Some(s) => s,
                None => return Ok(None),
            };

            let mut shutdown_rx = self.shutdown_rx.clone();

            tokio::select! {
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        let _ = self.write_str("* BYE Server shutting down\r\n").await;
                        return Ok(None);
                    }
                }
                res = timeout(self.auth_timeout, stream.read_buf(&mut self.read_buf)) => {
                    match res {
                        Ok(Ok(0)) => return Ok(None),
                        Ok(Ok(_n)) => {}
                        Ok(Err(e)) => {
                            if matches!(
                                e.kind(),
                                io::ErrorKind::ConnectionReset
                                    | io::ErrorKind::BrokenPipe
                                    | io::ErrorKind::ConnectionAborted
                                    | io::ErrorKind::UnexpectedEof
                            ) {
                                info!("[ClientSession {}] Connection closed by client ({})", self.id, e.kind());
                                return Ok(None);
                            }
                            return Err(e);
                        }
                        Err(_) => {
                            warn!("[ClientSession {}] Connection timed out after inactivity", self.id);
                            let _ = self.write_str(&ImapResponse::untagged("BYE", "Connection timed out", None)).await;
                            return Ok(None);
                        }
                    }
                }
            }
        }
    }

    fn extract_line_from_buf(&mut self) -> Option<String> {
        let pos = self.read_buf.iter().position(|&b| b == b'\n')?;
        let raw = self.read_buf.split_to(pos + 1);
        let s = String::from_utf8_lossy(&raw);
        Some(s.trim_end_matches(&['\r', '\n'][..]).trim().to_string())
    }

    async fn read_exact_bytes_raw(&mut self, len: usize) -> io::Result<Vec<u8>> {
        while self.read_buf.len() < len {
            let stream = match self.stream.as_mut() {
                Some(s) => s,
                None => return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "stream closed")),
            };
            let n = stream.read_buf(&mut self.read_buf).await?;
            if n == 0 {
                return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "EOF in literal"));
            }
        }
        Ok(self.read_buf.split_to(len).to_vec())
    }

    async fn read_exact_bytes(&mut self, len: usize) -> io::Result<Vec<u8>> {
        let data = self.read_exact_bytes_raw(len).await?;
        while self
            .read_buf
            .first()
            .map(|&b| b == b'\r' || b == b'\n')
            .unwrap_or(false)
        {
            let _ = self.read_buf.split_to(1);
        }
        Ok(data)
    }

    async fn dispatch_command(&mut self, parsed: &ParsedCommand) -> io::Result<()> {
        let tag = &parsed.tag;
        match parsed.command.as_str() {
            "CAPABILITY" => {
                let caps = self.current_capabilities();
                self.write_str(&ImapResponse::capability(caps)).await?;
                self.write_str(&ImapResponse::tagged(tag, "OK", "CAPABILITY completed", None))
                    .await?;
            }
            "STARTTLS" => {
                self.handle_starttls(tag).await?;
            }
            "NOOP" => {
                self.write_str(&ImapResponse::tagged(tag, "OK", "NOOP completed", None))
                    .await?;
            }
            "LOGOUT" => {
                self.state = ImapState::Logout;
                self.write_str(&ImapResponse::untagged(
                    "BYE",
                    "LEMail IMAP4rev1 Server logging out",
                    None,
                ))
                .await?;
                self.write_str(&ImapResponse::tagged(tag, "OK", "LOGOUT completed", None))
                    .await?;
            }
            // --- Authentication ---
            "LOGIN" => {
                let username = parsed.attributes.first().map(|a| a.as_str_trimmed());
                let password = parsed.attributes.get(1).map(|a| a.as_str_trimmed());
                AuthHandler::handle_login(
                    self,
                    tag,
                    username.as_deref(),
                    password.as_deref(),
                )
                .await?;
            }
            "AUTHENTICATE" => {
                let mechanism = parsed.attr_str(0, "").to_ascii_uppercase();
                let initial_response = parsed.attr_str(1, "");

                if mechanism != "PLAIN" {
                    self.write_str(&ImapResponse::tagged(
                        tag,
                        "NO",
                        &format!("Unsupported authentication mechanism: {mechanism}"),
                        None,
                    ))
                    .await?;
                    return Ok(());
                }

                if !initial_response.is_empty() {
                    AuthHandler::handle_authenticate_plain(self, tag, &initial_response).await?;
                } else {
                    self.pending_auth = Some(("PLAIN".to_string(), tag.to_string()));
                    self.write_str(&ImapResponse::continuation("")).await?;
                }
            }
            // --- Mailbox / Folders ---
            "LIST" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let (reference, pattern, is_special_use) =
                    Self::parse_list_parameters(&parsed.attributes);
                FolderHandler::handle_list(self, tag, &reference, &pattern, is_special_use).await?;
            }
            "LSUB" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let (reference, pattern, is_special_use) =
                    Self::parse_list_parameters(&parsed.attributes);
                FolderHandler::handle_lsub(self, tag, &reference, &pattern, is_special_use).await?;
            }
            "STATUS" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let mailbox = parsed.attr_str(0, "");
                let status_items = Self::extract_status_items(&parsed.raw_line, parsed);
                FolderHandler::handle_status(self, tag, &mailbox, &status_items).await?;
            }
            "SELECT" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let mailbox = parsed.attr_str(0, "");
                FolderHandler::handle_select(self, tag, &mailbox, false).await?;
            }
            "EXAMINE" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let mailbox = parsed.attr_str(0, "");
                FolderHandler::handle_select(self, tag, &mailbox, true).await?;
            }
            "CREATE" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let mailbox = parsed.attr_str(0, "");
                FolderHandler::handle_create(self, tag, &mailbox).await?;
            }
            "DELETE" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let mailbox = parsed.attr_str(0, "");
                FolderHandler::handle_delete(self, tag, &mailbox).await?;
            }
            "RENAME" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let old_name = parsed.attr_str(0, "");
                let new_name = parsed.attr_str(1, "");
                FolderHandler::handle_rename(self, tag, &old_name, &new_name).await?;
            }
            "SUBSCRIBE" | "UNSUBSCRIBE" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                self.write_str(&ImapResponse::tagged(
                    tag,
                    "OK",
                    &format!("{} completed", parsed.command),
                    None,
                ))
                .await?;
            }
            "NAMESPACE" => {
                self.write_str("* NAMESPACE ((\"\" \"/\")) NIL NIL\r\n").await?;
                self.write_str(&ImapResponse::tagged(tag, "OK", "NAMESPACE completed", None))
                    .await?;
            }
            "ENABLE" => {
                self.write_str(&ImapResponse::tagged(tag, "OK", "ENABLE completed", None))
                    .await?;
            }
            "CLOSE" | "UNSELECT" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                self.selected_mailbox = None;
                self.state = ImapState::Authenticated;
                self.write_str(&ImapResponse::tagged(
                    tag,
                    "OK",
                    &format!("{} completed", parsed.command),
                    None,
                ))
                .await?;
            }
            // --- Messages ---
            "FETCH" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let seq_set = parsed.attr_str(0, "");
                let raw_after = Self::slice_after_token(&parsed.raw_line, &seq_set);
                MessageHandler::handle_fetch(self, tag, &seq_set, raw_after, false).await?;
            }
            "STORE" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let seq_set = parsed.attr_str(0, "");
                let action = parsed.attr_str(1, "");
                let raw_after = Self::slice_after_token(&parsed.raw_line, &action);
                MessageHandler::handle_store(self, tag, &seq_set, &action, raw_after, false)
                    .await?;
            }
            "SEARCH" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let tokens = ImapUtils::parse_search_criteria(&parsed.raw_line);
                let criteria = tokens
                    .iter()
                    .position(|t| t.eq_ignore_ascii_case("SEARCH"))
                    .map(|idx| &tokens[idx + 1..])
                    .unwrap_or(&[]);
                MessageHandler::handle_search(self, tag, criteria, false).await?;
            }
            "EXPUNGE" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                MessageHandler::handle_expunge(self, tag).await?;
            }
            "COPY" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let seq_set = parsed.attr_str(0, "");
                let target = parsed.attr_str(1, "");
                MessageHandler::handle_copy_move(self, tag, &seq_set, &target, false, false)
                    .await?;
            }
            "MOVE" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let seq_set = parsed.attr_str(0, "");
                let target = parsed.attr_str(1, "");
                MessageHandler::handle_copy_move(self, tag, &seq_set, &target, true, false).await?;
            }
            "UID" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                let sub = parsed.attr_str(0, "").to_ascii_uppercase();
                let seq_set = parsed.attr_str(1, "");
                match sub.as_str() {
                    "FETCH" => {
                        let raw_after = Self::slice_after_token(&parsed.raw_line, &seq_set);
                        MessageHandler::handle_fetch(self, tag, &seq_set, raw_after, true).await?;
                    }
                    "STORE" => {
                        let action = parsed.attr_str(2, "");
                        let raw_after = Self::slice_after_token(&parsed.raw_line, &action);
                        MessageHandler::handle_store(self, tag, &seq_set, &action, raw_after, true)
                            .await?;
                    }
                    "SEARCH" => {
                        let tokens = ImapUtils::parse_search_criteria(&parsed.raw_line);
                        let criteria = tokens
                            .iter()
                            .position(|t| t.eq_ignore_ascii_case("SEARCH"))
                            .map(|idx| &tokens[idx + 1..])
                            .unwrap_or(&[]);
                        MessageHandler::handle_search(self, tag, criteria, true).await?;
                    }
                    "COPY" => {
                        let target = parsed.attr_str(2, "");
                        MessageHandler::handle_copy_move(self, tag, &seq_set, &target, false, true)
                            .await?;
                    }
                    "MOVE" => {
                        let target = parsed.attr_str(2, "");
                        MessageHandler::handle_copy_move(self, tag, &seq_set, &target, true, true)
                            .await?;
                    }
                    "EXPUNGE" => {
                        MessageHandler::handle_expunge(self, tag).await?;
                    }
                    _ => {
                        self.write_str(&ImapResponse::tagged(
                            tag,
                            "BAD",
                            &format!("Unknown UID subcommand: {sub}"),
                            None,
                        ))
                        .await?;
                    }
                }
            }
            // --- Real-time Push (IDLE) ---
            "IDLE" => {
                if !self.require_auth(tag).await? {
                    return Ok(());
                }
                self.handle_idle(tag).await?;
            }
            _ => {
                self.write_str(&ImapResponse::tagged(
                    tag,
                    "BAD",
                    &format!("Command '{}' not yet supported", parsed.command),
                    None,
                ))
                .await?;
            }
        }
        Ok(())
    }

    async fn handle_idle(&mut self, tag: &str) -> io::Result<()> {
        let Some(user) = self.user.clone() else {
            self.write_str(&ImapResponse::tagged(
                tag,
                "NO",
                "Please log in first",
                None,
            ))
            .await?;
            return Ok(());
        };
        // RFC 2177: IDLE은 Authenticated 및 Selected 상태 모두에서 허용됨
        let selected_mailbox = self.selected_mailbox.clone();

        self.write_str(&ImapResponse::continuation("idling")).await?;

        let mut sub = self.ctx.redis.subscribe_user(&user.id).await;
        let db = self.ctx.db.clone();
        let mut shutdown_rx = self.shutdown_rx.clone();
        // RFC 2177: IDLE 최대 30분 대기
        let idle_timeout = Duration::from_secs(30 * 60);

        loop {
            if let Some(line) = self.extract_line_from_buf() {
                if !line.is_empty() {
                    info!("[ClientSession {}] C: {} (IDLE)", self.id, line);
                    if line.eq_ignore_ascii_case("DONE") {
                        drop(sub);
                        self.write_str(&ImapResponse::tagged(tag, "OK", "IDLE terminated", None))
                            .await?;
                        return Ok(());
                    }
                }
                continue;
            }

            enum IdleAction {
                Shutdown,
                Timeout,
                Eof,
                ReadErr(io::Error),
                ReadMore,
                NotifyMailbox(String),
            }

            let action = {
                let Some(stream) = self.stream.as_mut() else {
                    return Ok(());
                };
                let read_buf = &mut self.read_buf;

                tokio::select! {
                    _ = shutdown_rx.changed() => {
                        if *shutdown_rx.borrow() {
                            IdleAction::Shutdown
                        } else {
                            IdleAction::ReadMore
                        }
                    }
                    ev = sub.recv() => {
                        match (ev, selected_mailbox.as_ref()) {
                            (Ok(event), Some(mb)) if event.folder_id == mb.id => {
                                IdleAction::NotifyMailbox(mb.id.clone())
                            }
                            _ => IdleAction::ReadMore,
                        }
                    }
                    res = timeout(idle_timeout, stream.read_buf(read_buf)) => {
                        match res {
                            Ok(Ok(0)) => IdleAction::Eof,
                            Ok(Ok(_)) => IdleAction::ReadMore,
                            Ok(Err(e)) => IdleAction::ReadErr(e),
                            Err(_) => IdleAction::Timeout,
                        }
                    }
                }
            };

            match action {
                IdleAction::Shutdown => {
                    drop(sub);
                    self.state = ImapState::Logout;
                    let _ = self.write_str("* BYE Server shutting down\r\n").await;
                    return Ok(());
                }
                IdleAction::Timeout => {
                    drop(sub);
                    self.state = ImapState::Logout;
                    let _ = self
                        .write_str(&ImapResponse::untagged("BYE", "IDLE timed out", None))
                        .await;
                    return Ok(());
                }
                IdleAction::Eof => {
                    drop(sub);
                    self.state = ImapState::Logout;
                    return Ok(());
                }
                IdleAction::ReadErr(e) => {
                    drop(sub);
                    if matches!(
                        e.kind(),
                        io::ErrorKind::ConnectionReset
                            | io::ErrorKind::BrokenPipe
                            | io::ErrorKind::ConnectionAborted
                            | io::ErrorKind::UnexpectedEof
                    ) {
                        info!("[ClientSession {}] Connection closed by client during IDLE ({})", self.id, e.kind());
                        self.state = ImapState::Logout;
                        return Ok(());
                    }
                    return Err(e);
                }
                IdleAction::ReadMore => {}
                IdleAction::NotifyMailbox(mailbox_id) => {
                    let count: i64 = sqlx::query_scalar::<_, i64>(
                        "SELECT COUNT(*) FROM user_mail WHERE folder_id = ? AND is_deleted = false",
                    )
                    .bind(&mailbox_id)
                    .fetch_one(db.pool())
                    .await
                    .unwrap_or(0);
                    self.write_str(&format!("* {count} EXISTS\r\n* 1 RECENT\r\n"))
                        .await?;
                }
            }
        }
    }

    async fn handle_starttls(&mut self, tag: &str) -> io::Result<()> {
        info!(
            "[ClientSession {}] STARTTLS requested, upgrading socket to TLS...",
            self.id
        );
        if !self.enable_starttls {
            self.write_str(&ImapResponse::tagged(tag, "BAD", "STARTTLS is disabled", None))
                .await?;
            return Ok(());
        }
        if self.is_tls {
            self.write_str(&ImapResponse::tagged(
                tag,
                "BAD",
                "Already in TLS / SSL mode",
                None,
            ))
            .await?;
            return Ok(());
        }

        self.write_str(&ImapResponse::tagged(
            tag,
            "OK",
            "Begin TLS negotiation now",
            None,
        ))
        .await?;

        let plain_stream = match self.stream.take() {
            Some(ImapStream::Plain(tcp)) => tcp,
            other => {
                self.stream = other;
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Cannot upgrade non-plain stream",
                ));
            }
        };

        self.read_buf.clear();

        match self.tls_acceptor.accept(plain_stream).await {
            Ok(tls_stream) => {
                self.stream = Some(ImapStream::Tls(Box::new(tls_stream)));
                self.is_tls = true;
                info!(
                    "[ClientSession {}] STARTTLS upgrade completed successfully",
                    self.id
                );
                Ok(())
            }
            Err(e) => {
                warn!(
                    "[ClientSession {}] TLS handshake error during STARTTLS: {}",
                    self.id, e
                );
                Err(e)
            }
        }
    }

    fn parse_list_parameters(attrs: &[ImapAttr]) -> (String, String, bool) {
        let mut is_special_use = false;
        let mut ref_idx = 0usize;
        let mut pat_idx = 1usize;

        if attrs.len() >= 3 {
            let first = &attrs[0];
            let first_str = first.as_str_trimmed();
            if first.is_list()
                || first_str.starts_with('(')
                || first_str.to_ascii_uppercase().contains("SPECIAL-USE")
            {
                is_special_use = first_str.to_ascii_uppercase().contains("SPECIAL-USE");
                ref_idx = 1;
                pat_idx = 2;
            }
        }

        let reference = attrs
            .get(ref_idx)
            .map(|a| a.as_str_trimmed())
            .unwrap_or_default();
        let pattern = attrs
            .get(pat_idx)
            .map(|a| a.as_str_trimmed())
            .unwrap_or_else(|| "*".to_string());

        (reference, pattern, is_special_use)
    }

    fn extract_status_items(raw_line: &str, parsed: &ParsedCommand) -> Vec<String> {
        if let (Some(open), Some(close)) = (raw_line.find('('), raw_line.rfind(')')) {
            if open < close {
                return raw_line[open + 1..close]
                    .split_whitespace()
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect();
            }
        }
        parsed.attr_list(1)
    }

    fn slice_after_token<'a>(raw_line: &'a str, token: &str) -> &'a str {
        if token.is_empty() {
            return "";
        }
        match raw_line.find(token) {
            Some(idx) => raw_line[idx + token.len()..].trim(),
            None => "",
        }
    }

    async fn require_auth(&mut self, tag: &str) -> io::Result<bool> {
        if self.state == ImapState::NotAuthenticated || self.user.is_none() {
            self.write_str(&ImapResponse::tagged(
                tag,
                "NO",
                "Please log in first",
                None,
            ))
            .await?;
            return Ok(false);
        }
        Ok(true)
    }
}
