use futures_util::StreamExt;
use redis::aio::ConnectionManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, mpsc, Mutex, RwLock};
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailboxEvent {
    #[serde(rename = "type", default)]
    pub event_type: String,
    #[serde(rename = "userId", default)]
    pub user_id: String,
    #[serde(rename = "folderId", default)]
    pub folder_id: String,
    #[serde(default)]
    pub uid: u32,
    #[serde(rename = "messageId", default)]
    pub message_id: String,
}

struct UserChannel {
    sender: broadcast::Sender<MailboxEvent>,
    ref_count: usize,
}

enum PubSubCmd {
    Subscribe(String),
    Unsubscribe(String),
    Shutdown,
}

#[derive(Clone)]
pub struct RedisService {
    redis_url: String,
    cmd_conn: Arc<Mutex<Option<ConnectionManager>>>,
    channels: Arc<RwLock<HashMap<String, UserChannel>>>,
    pubsub_tx: Arc<Mutex<Option<mpsc::UnboundedSender<PubSubCmd>>>>,
}

pub struct UserSubscription {
    user_id: String,
    rx: broadcast::Receiver<MailboxEvent>,
    service: RedisService,
}

impl UserSubscription {
    pub async fn recv(&mut self) -> Result<MailboxEvent, broadcast::error::RecvError> {
        self.rx.recv().await
    }
}

impl Drop for UserSubscription {
    fn drop(&mut self) {
        let user_id = self.user_id.clone();
        let service = self.service.clone();
        tokio::spawn(async move {
            service.unsubscribe_user(&user_id).await;
        });
    }
}

impl RedisService {
    pub fn from_env() -> Self {
        let host = env::var("REDIS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("REDIS_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(6379);
        let password = env::var("REDIS_PASSWORD").ok().filter(|s| !s.is_empty());

        let redis_url = match password {
            Some(pw) => format!("redis://:{pw}@{host}:{port}/"),
            None => format!("redis://{host}:{port}/"),
        };

        Self {
            redis_url,
            cmd_conn: Arc::new(Mutex::new(None)),
            channels: Arc::new(RwLock::new(HashMap::new())),
            pubsub_tx: Arc::new(Mutex::new(None)),
        }
    }

    async fn get_cmd_conn(&self) -> Option<ConnectionManager> {
        let mut guard = self.cmd_conn.lock().await;
        if let Some(conn) = guard.as_ref() {
            return Some(conn.clone());
        }

        let client = match redis::Client::open(self.redis_url.as_str()) {
            Ok(c) => c,
            Err(e) => {
                warn!("[RedisService] Invalid Redis URL: {}", e);
                return None;
            }
        };

        match ConnectionManager::new(client).await {
            Ok(conn) => {
                info!("[RedisService] Redis Command client initialized.");
                *guard = Some(conn.clone());
                Some(conn)
            }
            Err(e) => {
                warn!("[RedisService] Redis connect error: {}", e);
                None
            }
        }
    }

    pub async fn publish_metrics(&self, active_sessions: usize, max_connections: usize) {
        let Some(mut conn) = self.get_cmd_conn().await else {
            return;
        };

        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis().to_string())
            .unwrap_or_else(|_| "0".to_string());

        let mut pipe = redis::pipe();
        pipe.cmd("SET")
            .arg("imap:stats:active_connections")
            .arg(active_sessions.to_string())
            .ignore()
            .cmd("SET")
            .arg("imap:stats:max_connections")
            .arg(max_connections.to_string())
            .ignore()
            .cmd("SET")
            .arg("imap:stats:heartbeat")
            .arg(now_ms)
            .arg("EX")
            .arg(15)
            .ignore();

        if let Err(e) = pipe.query_async::<()>(&mut conn).await {
            warn!("[RedisService] Failed to publish metrics: {}", e);
        }
    }

    pub async fn clear_metrics(&self) {
        let guard = self.cmd_conn.lock().await;
        let Some(mut conn) = guard.clone() else {
            return;
        };
        drop(guard);

        let mut pipe = redis::pipe();
        pipe.cmd("SET")
            .arg("imap:stats:active_connections")
            .arg("0")
            .ignore()
            .cmd("DEL")
            .arg("imap:stats:heartbeat")
            .ignore();

        if let Err(e) = pipe.query_async::<()>(&mut conn).await {
            warn!("[RedisService] Failed to clear metrics: {}", e);
        }
    }

    async fn ensure_pubsub_actor(&self) -> Option<mpsc::UnboundedSender<PubSubCmd>> {
        let mut guard = self.pubsub_tx.lock().await;
        if let Some(tx) = guard.as_ref() {
            if !tx.is_closed() {
                return Some(tx.clone());
            }
        }

        let (tx, mut rx) = mpsc::unbounded_channel::<PubSubCmd>();
        let redis_url = self.redis_url.clone();
        let channels = Arc::clone(&self.channels);

        tokio::spawn(async move {
            let client = match redis::Client::open(redis_url.as_str()) {
                Ok(c) => c,
                Err(e) => {
                    warn!("[RedisService] PubSub invalid URL: {}", e);
                    return;
                }
            };

            let mut pubsub = match client.get_async_pubsub().await {
                Ok(p) => {
                    info!("[RedisService] Redis Pub/Sub client initialized.");
                    p
                }
                Err(e) => {
                    warn!("[RedisService] PubSub connect error: {}", e);
                    return;
                }
            };

            // 이미 등록된 유저 채널 재구독
            {
                let map = channels.read().await;
                for user_id in map.keys() {
                    let ch = format!("mailbox:events:{user_id}");
                    let _ = pubsub.subscribe(&ch).await;
                }
            }

            loop {
                tokio::select! {
                    cmd = rx.recv() => {
                        match cmd {
                            Some(PubSubCmd::Subscribe(ch)) => {
                                if let Err(e) = pubsub.subscribe(&ch).await {
                                    warn!("[RedisService] Failed to subscribe to {}: {}", ch, e);
                                }
                            }
                            Some(PubSubCmd::Unsubscribe(ch)) => {
                                let _ = pubsub.unsubscribe(&ch).await;
                            }
                            Some(PubSubCmd::Shutdown) | None => {
                                info!("[RedisService] Redis Pub/Sub actor shutting down.");
                                break;
                            }
                        }
                    }
                    msg = async {
                        let mut stream = pubsub.on_message();
                        stream.next().await
                    } => {
                        match msg {
                            Some(m) => {
                                let channel_name = m.get_channel_name().to_string();
                                if let Ok(payload_str) = m.get_payload::<String>() {
                                    match serde_json::from_str::<MailboxEvent>(&payload_str) {
                                        Ok(mut ev) => {
                                            if ev.user_id.is_empty() {
                                                ev.user_id = channel_name
                                                    .strip_prefix("mailbox:events:")
                                                    .unwrap_or("")
                                                    .to_string();
                                            }
                                            let map = channels.read().await;
                                            if let Some(uc) = map.get(&ev.user_id) {
                                                let _ = uc.sender.send(ev);
                                            }
                                        }
                                        Err(e) => {
                                            warn!("[RedisService] Error parsing pubsub message: {}", e);
                                        }
                                    }
                                }
                            }
                            None => {
                                warn!("[RedisService] Redis Pub/Sub stream ended.");
                                break;
                            }
                        }
                    }
                }
            }
        });

        *guard = Some(tx.clone());
        Some(tx)
    }

    pub async fn subscribe_user(&self, user_id: &str) -> UserSubscription {
        let mut need_subscribe = false;
        let rx = {
            let mut map = self.channels.write().await;
            if let Some(entry) = map.get_mut(user_id) {
                entry.ref_count += 1;
                entry.sender.subscribe()
            } else {
                let (sender, rx) = broadcast::channel(64);
                map.insert(
                    user_id.to_string(),
                    UserChannel {
                        sender,
                        ref_count: 1,
                    },
                );
                need_subscribe = true;
                rx
            }
        };

        if need_subscribe {
            if let Some(tx) = self.ensure_pubsub_actor().await {
                let _ = tx.send(PubSubCmd::Subscribe(format!("mailbox:events:{user_id}")));
            }
        }

        UserSubscription {
            user_id: user_id.to_string(),
            rx,
            service: self.clone(),
        }
    }

    async fn unsubscribe_user(&self, user_id: &str) {
        let mut need_unsubscribe = false;
        {
            let mut map = self.channels.write().await;
            if let Some(entry) = map.get_mut(user_id) {
                entry.ref_count = entry.ref_count.saturating_sub(1);
                if entry.ref_count == 0 {
                    map.remove(user_id);
                    need_unsubscribe = true;
                }
            }
        }

        if need_unsubscribe {
            let guard = self.pubsub_tx.lock().await;
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(PubSubCmd::Unsubscribe(format!("mailbox:events:{user_id}")));
            }
        }
    }

    pub async fn close(&self) {
        if let Some(tx) = self.pubsub_tx.lock().await.take() {
            let _ = tx.send(PubSubCmd::Shutdown);
        }
        self.channels.write().await.clear();
        *self.cmd_conn.lock().await = None;
        info!("[RedisService] Redis clients closed.");
    }
}
