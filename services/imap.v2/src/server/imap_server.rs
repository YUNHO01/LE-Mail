use crate::config::ImapServerConfig;
use crate::server::client_session::{AppContext, ClientSession, ImapStream};
use crate::server::tls_manager::TlsManager;
use crate::services::db::DbService;
use crate::services::license::ImapLicenseService;
use crate::services::redis::RedisService;
use anyhow::{Context, Result};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::{oneshot, watch};
use tokio_rustls::TlsAcceptor;
use tracing::{error, info, warn};

pub struct ImapServer {
    config: ImapServerConfig,
    ctx: AppContext,
    active_sessions: Arc<AtomicUsize>,
    shutdown_tx: watch::Sender<bool>,
}

impl ImapServer {
    pub fn new(config: ImapServerConfig) -> Self {
        let db = DbService::from_env().expect("Failed to configure DB pool");
        let redis = RedisService::from_env();
        let license = ImapLicenseService::new(db.clone());
        let ctx = AppContext {
            db,
            redis,
            license,
            archive_dir: config.archive_dir.clone(),
        };
        let (shutdown_tx, _) = watch::channel(false);
        Self {
            config,
            ctx,
            active_sessions: Arc::new(AtomicUsize::new(0)),
            shutdown_tx,
        }
    }

    pub fn shutdown_handle(&self) -> watch::Sender<bool> {
        self.shutdown_tx.clone()
    }

    pub async fn run(&self) -> Result<()> {
        self.run_with_ready(None).await
    }

    pub async fn run_with_ready(
        &self,
        ready_tx: Option<oneshot::Sender<(u16, u16)>>,
    ) -> Result<()> {
        // 기동 시 라이선스 상태 검증 및 로깅 (비동기 논블로킹: 테스트/DB 미연결 시에도 서버 기동 허용)
        if ready_tx.is_none() {
            let license_status = self.ctx.license.check_license(true).await;
            if license_status.is_valid {
                info!(
                    "[ImapServer] ✅ System License Verified: [{}] Max Users: {} (Current: {}) - Expiry: {}",
                    license_status.organization_name.as_deref().unwrap_or("-"),
                    license_status.max_users.unwrap_or(0),
                    license_status.current_users.unwrap_or(0),
                    if license_status.is_unlimited.unwrap_or(false) {
                        "Unlimited"
                    } else {
                        license_status.expires_at.as_deref().unwrap_or("-")
                    }
                );
            } else {
                warn!(
                    "[ImapServer] ⚠️ System License Warning: {} (Client logins will be restricted until valid license is registered)",
                    license_status.message
                );
            }
        }

        let tls_config = TlsManager::load_or_create_server_config(
            self.config.cert_path.as_deref(),
            self.config.key_path.as_deref(),
        )?;
        let tls_acceptor = Arc::new(TlsAcceptor::from(tls_config));

        let plain_addr = format!("{}:{}", self.config.host, self.config.port);
        let tls_addr = format!("{}:{}", self.config.host, self.config.secure_port);

        let plain_listener = TcpListener::bind(&plain_addr)
            .await
            .with_context(|| format!("Failed to bind Plain/STARTTLS on {plain_addr}"))?;
        let actual_plain_port = plain_listener.local_addr()?.port();
        info!(
            "[ImapServer] Plain/STARTTLS listening on {}:{}",
            self.config.host, actual_plain_port
        );

        let tls_listener = TcpListener::bind(&tls_addr)
            .await
            .with_context(|| format!("Failed to bind IMAPS on {tls_addr}"))?;
        let actual_tls_port = tls_listener.local_addr()?.port();
        info!(
            "[ImapServer] IMAPS (Direct TLS) listening on {}:{}",
            self.config.host, actual_tls_port
        );

        // 5초 주기 Redis 메트릭 리포터 시작
        let metrics_handle = if ready_tx.is_none() {
            let redis = self.ctx.redis.clone();
            let active = Arc::clone(&self.active_sessions);
            let max_conn = self.config.max_connections;
            let mut rx = self.shutdown_tx.subscribe();
            Some(tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(5));
                loop {
                    tokio::select! {
                        _ = rx.changed() => {
                            if *rx.borrow() {
                                break;
                            }
                        }
                        _ = interval.tick() => {
                            let count = active.load(Ordering::SeqCst);
                            redis.publish_metrics(count, max_conn).await;
                        }
                    }
                }
            }))
        } else {
            None
        };

        info!(
            "[ImapServer] LEMail IMAP v2 (Rust) started: Plain/STARTTLS on port {}, IMAPS on port {}",
            actual_plain_port, actual_tls_port
        );

        if let Some(tx) = ready_tx {
            let _ = tx.send((actual_plain_port, actual_tls_port));
        }

        let mut shutdown_rx = self.shutdown_tx.subscribe();

        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        info!("[ImapServer] Shutdown signal received. Stopping listeners...");
                        break;
                    }
                }
                res = plain_listener.accept() => {
                    match res {
                        Ok((socket, peer_addr)) => {
                            self.spawn_connection(
                                socket,
                                peer_addr.to_string(),
                                false,
                                Arc::clone(&tls_acceptor),
                            );
                        }
                        Err(e) => {
                            error!("[ImapServer] Plain TCP accept error: {}", e);
                        }
                    }
                }
                res = tls_listener.accept() => {
                    match res {
                        Ok((socket, peer_addr)) => {
                            self.spawn_connection(
                                socket,
                                peer_addr.to_string(),
                                true,
                                Arc::clone(&tls_acceptor),
                            );
                        }
                        Err(e) => {
                            error!("[ImapServer] IMAPS TCP accept error: {}", e);
                        }
                    }
                }
            }
        }

        if let Some(h) = metrics_handle {
            let _ = h.await;
        }
        self.ctx.redis.clear_metrics().await;
        self.ctx.redis.close().await;
        self.ctx.db.close().await;
        info!("[ImapServer] IMAP server stopped cleanly.");
        Ok(())
    }

    fn spawn_connection(
        &self,
        mut socket: tokio::net::TcpStream,
        peer_id: String,
        is_direct_tls: bool,
        tls_acceptor: Arc<TlsAcceptor>,
    ) {
        let conn_type = if is_direct_tls {
            "IMAPS (Direct TLS)"
        } else {
            "Plain/STARTTLS"
        };
        info!(
            "[ImapServer] New connection attempt from {} [{}]",
            peer_id, conn_type
        );

        let current = self.active_sessions.load(Ordering::SeqCst);
        if current >= self.config.max_connections {
            warn!(
                "[ImapServer] Connection rejected for {}: Server busy (max connections: {})",
                peer_id, self.config.max_connections
            );
            tokio::spawn(async move {
                let _ = socket
                    .write_all(b"* BYE Server is too busy, connection rejected\r\n")
                    .await;
                let _ = socket.shutdown().await;
            });
            return;
        }

        let active_sessions = Arc::clone(&self.active_sessions);
        let enable_starttls = self.config.enable_starttls;
        let auth_timeout = Duration::from_millis(self.config.auth_timeout_ms);
        let shutdown_rx = self.shutdown_tx.subscribe();
        let ctx = self.ctx.clone();

        active_sessions.fetch_add(1, Ordering::SeqCst);

        tokio::spawn(async move {
            let _guard = SessionCounterGuard(active_sessions);

            let stream = if is_direct_tls {
                match tls_acceptor.accept(socket).await {
                    Ok(tls_stream) => ImapStream::Tls(Box::new(tls_stream)),
                    Err(e) => {
                        warn!(
                            "[ImapServer] TLS Client Handshake Error from {}: {}",
                            peer_id, e
                        );
                        return;
                    }
                }
            } else {
                ImapStream::Plain(socket)
            };

            let session = ClientSession::new(
                peer_id,
                ctx,
                stream,
                is_direct_tls,
                enable_starttls,
                tls_acceptor,
                auth_timeout,
                shutdown_rx,
            );
            session.run().await;
        });
    }
}

struct SessionCounterGuard(Arc<AtomicUsize>);

impl Drop for SessionCounterGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}
