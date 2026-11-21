use lemail_imap::config::ImapServerConfig;
use lemail_imap::server::imap_server::ImapServer;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, SignatureScheme};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

#[derive(Debug)]
struct NoCertVerifier;

impl ServerCertVerifier for NoCertVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

fn insecure_tls_connector() -> TlsConnector {
    let config = ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(NoCertVerifier))
        .with_no_client_auth();
    TlsConnector::from(Arc::new(config))
}

async fn read_until<S: AsyncRead + Unpin>(stream: &mut S, expected: &str) -> String {
    let mut buf = String::new();
    let mut chunk = [0u8; 1024];
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        assert!(!remaining.is_zero(), "Timeout waiting for '{expected}'. Got: {buf}");
        let n = tokio::time::timeout(remaining, stream.read(&mut chunk))
            .await
            .expect("read timeout")
            .expect("read error");
        assert!(n > 0, "Unexpected EOF waiting for '{expected}'. Got: {buf}");
        buf.push_str(&String::from_utf8_lossy(&chunk[..n]));
        if buf.contains(expected) {
            return buf;
        }
    }
}

async fn send_cmd<S: AsyncWrite + Unpin>(stream: &mut S, cmd: &str) {
    stream.write_all(cmd.as_bytes()).await.expect("write failed");
    stream.flush().await.expect("flush failed");
}

#[tokio::test]
async fn test_phase1_plain_starttls_and_imaps() {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let cfg = ImapServerConfig {
        host: "127.0.0.1".to_string(),
        port: 0,
        secure_port: 0,
        enable_starttls: true,
        max_connections: 50,
        auth_timeout_ms: 10_000,
        cert_path: None,
        key_path: None,
        archive_dir: PathBuf::from("./mail-archive"),
    };

    let server = ImapServer::new(cfg);
    let shutdown_tx = server.shutdown_handle();
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();

    let server_task = tokio::spawn(async move {
        if let Err(e) = server.run_with_ready(Some(ready_tx)).await {
            panic!("ImapServer failed to start: {e:#}");
        }
    });

    let (plain_port, tls_port) = ready_rx.await.expect("Server failed before ready");

    // 1. Plain TCP: Banner, CAPABILITY, NOOP, NAMESPACE, LOGOUT
    {
        let mut plain = TcpStream::connect(("127.0.0.1", plain_port))
            .await
            .expect("plain connect failed");
        let banner = read_until(&mut plain, "\r\n").await;
        assert!(banner.starts_with("* OK"));
        assert!(banner.contains("IMAP4rev1"));
        assert!(banner.contains("STARTTLS"));

        send_cmd(&mut plain, "A001 CAPABILITY\r\n").await;
        let cap = read_until(&mut plain, "A001 OK").await;
        assert!(cap.contains("* CAPABILITY"));
        assert!(cap.contains("STARTTLS"));

        send_cmd(&mut plain, "A002 NOOP\r\n").await;
        let noop = read_until(&mut plain, "A002 OK").await;
        assert!(noop.contains("NOOP completed"));

        send_cmd(&mut plain, "A003 NAMESPACE\r\n").await;
        let ns = read_until(&mut plain, "A003 OK").await;
        assert!(ns.contains("* NAMESPACE"));

        send_cmd(&mut plain, "A004 LOGOUT\r\n").await;
        let logout = read_until(&mut plain, "A004 OK").await;
        assert!(logout.contains("* BYE"));
    }

    // 2. STARTTLS upgrade over plain connection
    {
        let mut plain = TcpStream::connect(("127.0.0.1", plain_port))
            .await
            .expect("starttls connect failed");
        let _ = read_until(&mut plain, "\r\n").await;

        send_cmd(&mut plain, "S001 STARTTLS\r\n").await;
        let resp = read_until(&mut plain, "S001 OK").await;
        assert!(resp.contains("Begin TLS negotiation now"));

        let connector = insecure_tls_connector();
        let server_name = ServerName::try_from("localhost").unwrap();
        let mut tls_stream = connector
            .connect(server_name, plain)
            .await
            .expect("STARTTLS handshake failed");

        send_cmd(&mut tls_stream, "S002 CAPABILITY\r\n").await;
        let cap = read_until(&mut tls_stream, "S002 OK").await;
        assert!(cap.contains("* CAPABILITY"));
        assert!(!cap.contains("STARTTLS"), "Post-TLS CAPABILITY must not advertise STARTTLS");

        send_cmd(&mut tls_stream, "S003 LOGOUT\r\n").await;
        let _ = read_until(&mut tls_stream, "S003 OK").await;
    }

    // 3. Direct IMAPS (TLS)
    {
        let tcp = TcpStream::connect(("127.0.0.1", tls_port))
            .await
            .expect("imaps connect failed");
        let connector = insecure_tls_connector();
        let server_name = ServerName::try_from("localhost").unwrap();
        let mut imaps = connector
            .connect(server_name, tcp)
            .await
            .expect("IMAPS handshake failed");

        let banner = read_until(&mut imaps, "\r\n").await;
        assert!(banner.starts_with("* OK"));
        assert!(!banner.contains("STARTTLS"));

        send_cmd(&mut imaps, "T001 CAPABILITY\r\n").await;
        let cap = read_until(&mut imaps, "T001 OK").await;
        assert!(cap.contains("IMAP4rev1"));

        send_cmd(&mut imaps, "T002 LOGOUT\r\n").await;
        let _ = read_until(&mut imaps, "T002 OK").await;
    }

    let _ = shutdown_tx.send(true);
    let _ = tokio::time::timeout(Duration::from_secs(3), server_task).await;
}
