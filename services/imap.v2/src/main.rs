use anyhow::Result;
use lemail_imap::config::ImapServerConfig;
use lemail_imap::server::imap_server::ImapServer;
use tracing::{error, info};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    // rustls CryptoProvider 명시적 등록 (ring)
    let _ = rustls::crypto::ring::default_provider().install_default();

    info!("====================================================");
    info!("    LEMail IMAP4rev1 Microservice v2 (Rust) Start   ");
    info!("====================================================");

    let config = ImapServerConfig::from_env();
    let server = ImapServer::new(config);
    let shutdown_tx = server.shutdown_handle();

    tokio::spawn(async move {
        if let Err(e) = wait_for_shutdown_signal().await {
            error!("Signal handler error: {}", e);
        }
        info!("Gracefully stopping IMAP server...");
        let _ = shutdown_tx.send(true);
    });

    if let Err(e) = server.run().await {
        error!("Failed to run IMAP server: {:#}", e);
        std::process::exit(1);
    }

    Ok(())
}

async fn wait_for_shutdown_signal() -> Result<()> {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = signal(SignalKind::terminate())?;
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = sigterm.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c().await?;
    }
    Ok(())
}
