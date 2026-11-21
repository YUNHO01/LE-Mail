use anyhow::Result;
use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions};
use sqlx::MySqlPool;
use std::env;
use std::time::Duration;
use tracing::info;

#[derive(Clone)]
pub struct DbService {
    pool: MySqlPool,
}

impl DbService {
    pub fn from_env() -> Result<Self> {
        let host = env::var("DB_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("DB_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(3300);
        let username = env::var("DB_USERNAME").unwrap_or_else(|_| "lemail".to_string());
        let password = env::var("DB_PASSWORD").unwrap_or_default();
        let database = env::var("DB_DATABASE").unwrap_or_else(|_| "lemaildb".to_string());
        let pool_size = env::var("DB_POOL_SIZE")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(20);

        let opts = MySqlConnectOptions::new()
            .host(&host)
            .port(port)
            .username(&username)
            .password(&password)
            .database(&database);

        let pool = MySqlPoolOptions::new()
            .max_connections(pool_size)
            .acquire_timeout(Duration::from_secs(10))
            .connect_lazy_with(opts);

        info!(
            "[DbService] MySQL connection pool configured ({}:{}/{}, max={}).",
            host, port, database, pool_size
        );

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &MySqlPool {
        &self.pool
    }

    pub async fn close(&self) {
        self.pool.close().await;
        info!("[DbService] MySQL connection pool closed.");
    }
}
