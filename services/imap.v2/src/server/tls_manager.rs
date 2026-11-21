use anyhow::{anyhow, Context, Result};
use rcgen::{CertificateParams, DistinguishedName, DnType};
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::ServerConfig;
use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::info;

pub struct TlsManager;

impl TlsManager {
    /// 기존 Node `TlsManager`와 호환되는 순서로 TLS 인증서/개인키를 로드하거나,
    /// 없을 경우 개발용 자가서명 인증서를 자동 생성합니다.
    pub fn load_or_create_server_config(
        custom_cert_path: Option<&str>,
        custom_key_path: Option<&str>,
    ) -> Result<Arc<ServerConfig>> {
        let (cert_pem, key_pem) = Self::load_or_create_pem(custom_cert_path, custom_key_path)?;
        Self::build_server_config(&cert_pem, &key_pem)
    }

    fn load_or_create_pem(
        custom_cert_path: Option<&str>,
        custom_key_path: Option<&str>,
    ) -> Result<(String, String)> {
        // 1. 환경변수로 명시된 커스텀 경로
        if let (Some(cp), Some(kp)) = (custom_cert_path, custom_key_path) {
            let c = Path::new(cp);
            let k = Path::new(kp);
            if c.is_file() && k.is_file() {
                info!("[TlsManager] Loaded TLS credentials from custom paths: {cp}, {kp}");
                return Ok((
                    fs::read_to_string(c).with_context(|| format!("Failed to read cert {cp}"))?,
                    fs::read_to_string(k).with_context(|| format!("Failed to read key {kp}"))?,
                ));
            }
        }

        // 2. 기존 services/imap/certs 및 로컬 certs 디렉터리 호환 탐색
        let candidate_dirs: Vec<PathBuf> = vec![
            PathBuf::from("certs"),
            PathBuf::from("../imap/certs"),
            PathBuf::from("services/imap/certs"),
            PathBuf::from("services/imap.v2/certs"),
        ];

        for dir in &candidate_dirs {
            let cert_file = dir.join("imap-cert.pem");
            let key_file = dir.join("imap-key.pem");
            if cert_file.is_file() && key_file.is_file() {
                info!(
                    "[TlsManager] Loaded TLS credentials from: {}",
                    dir.display()
                );
                return Ok((
                    fs::read_to_string(&cert_file)?,
                    fs::read_to_string(&key_file)?,
                ));
            }
        }

        // 3. 개발/로컬용 자가서명 인증서 자동 생성
        info!("[TlsManager] Generating self-signed TLS certificate for IMAP server...");
        let default_dir = PathBuf::from("certs");
        fs::create_dir_all(&default_dir)?;

        let mut params = CertificateParams::new(vec![
            "localhost".to_string(),
            "127.0.0.1".to_string(),
        ])?;
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, "localhost");
        dn.push(DnType::OrganizationName, "LEMail Dev");
        params.distinguished_name = dn;

        let key_pair = rcgen::KeyPair::generate()?;
        let cert = params.self_signed(&key_pair)?;

        let cert_pem = cert.pem();
        let key_pem = key_pair.serialize_pem();

        fs::write(default_dir.join("imap-cert.pem"), &cert_pem)?;
        fs::write(default_dir.join("imap-key.pem"), &key_pem)?;
        info!(
            "[TlsManager] Self-signed certificates saved to: {}",
            default_dir.display()
        );

        Ok((cert_pem, key_pem))
    }

    fn build_server_config(cert_pem: &str, key_pem: &str) -> Result<Arc<ServerConfig>> {
        let mut cert_reader = BufReader::new(cert_pem.as_bytes());
        let certs: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut cert_reader)
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("Failed to parse PEM certificates")?;

        if certs.is_empty() {
            return Err(anyhow!("No certificates found in PEM file"));
        }

        let mut key_reader = BufReader::new(key_pem.as_bytes());
        let key: PrivateKeyDer<'static> = rustls_pemfile::private_key(&mut key_reader)
            .context("Failed to parse PEM private key")?
            .ok_or_else(|| anyhow!("No private key found in PEM file"))?;

        let config = ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(certs, key)
            .context("Failed to build rustls ServerConfig")?;

        Ok(Arc::new(config))
    }
}
