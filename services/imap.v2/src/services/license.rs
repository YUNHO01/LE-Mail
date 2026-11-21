use crate::services::db::DbService;
use base64::Engine;
use chrono::{NaiveDateTime, Utc};
use rsa::pkcs1v15::{Signature, VerifyingKey};
use rsa::pkcs8::DecodePublicKey;
use rsa::signature::Verifier;
use rsa::RsaPublicKey;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{error, info};

pub const DEFAULT_LICENSE_PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy8lnI4j0NPdlsQB/BPfC
I5Z4cISGqF5b8tFK+N7Dkmkj7HfmpzqWUkLqVmrL++xh2csZxUFfq50myABfLad3
+2e1LQzkm5cDavBIO8Fk+oEyVvpUh8yOlJF8d4YsYfK+FoevwdhclPAdgc4OY+Ls
ROwybuwotZcpGDGLQhUEBgqgFiqiRRvYLygNlwZeBr8FcA+uW4Cgectta4bkCwOF
hgohtIpj92dzw/RFN9mtvO8gatR4i9GGYwP9jVSFok3h19qKgo7BjXwgcwVExhha
jQl2MWhKhoiddcS1vNaFb6rOYIi0jQ/X1XA6WUV1hBe2tIPqejL+tfPyYdyWz/8p
4wIDAQAB
-----END PUBLIC KEY-----";

const CACHE_TTL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize)]
pub struct LicenseStatusResult {
    pub is_valid: bool,
    pub license_id: Option<String>,
    pub product: Option<String>,
    pub organization_name: Option<String>,
    pub max_users: Option<i32>,
    pub current_users: Option<i64>,
    pub expires_at: Option<String>,
    pub is_unlimited: Option<bool>,
    pub is_expired: Option<bool>,
    pub days_remaining: Option<i64>,
    pub file_integrity_matched: bool,
    pub message: String,
}

impl LicenseStatusResult {
    fn invalid(message: impl Into<String>) -> Self {
        Self {
            is_valid: false,
            license_id: None,
            product: None,
            organization_name: None,
            max_users: None,
            current_users: None,
            expires_at: None,
            is_unlimited: None,
            is_expired: None,
            days_remaining: None,
            file_integrity_matched: false,
            message: message.into(),
        }
    }
}

#[derive(Clone)]
pub struct ImapLicenseService {
    db: DbService,
    public_key_pem: Arc<RwLock<Option<String>>>,
    cache: Arc<RwLock<Option<(Instant, LicenseStatusResult)>>>,
}

impl ImapLicenseService {
    pub fn new(db: DbService) -> Self {
        Self {
            db,
            public_key_pem: Arc::new(RwLock::new(None)),
            cache: Arc::new(RwLock::new(None)),
        }
    }

    async fn load_public_key(&self) -> String {
        if let Some(cached) = self.public_key_pem.read().await.as_ref() {
            return cached.clone();
        }

        let pem = Self::resolve_public_key_pem();
        *self.public_key_pem.write().await = Some(pem.clone());
        pem
    }

    pub fn resolve_public_key_pem() -> String {
        if let Ok(env_key) = env::var("LICENSE_PUBLIC_KEY") {
            if !env_key.trim().is_empty() {
                return env_key.replace("\\n", "\n");
            }
        }

        let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let candidates = vec![
            cwd.join("keys/license-public.pem"),
            cwd.join("../imap/keys/license-public.pem"),
            cwd.join("services/imap/keys/license-public.pem"),
            cwd.join("certs/license-public.pem"),
            cwd.join("../../apps/api/dist/modules/license/keys/license-public.pem"),
            cwd.join("../api/dist/modules/license/keys/license-public.pem"),
            cwd.join("apps/api/dist/modules/license/keys/license-public.pem"),
            cwd.join("../../apps/api/src/modules/license/keys/license-public.pem"),
            cwd.join("../api/src/modules/license/keys/license-public.pem"),
            cwd.join("apps/api/src/modules/license/keys/license-public.pem"),
        ];

        for p in candidates {
            if p.is_file() {
                if let Ok(content) = fs::read_to_string(&p) {
                    info!(
                        "[ImapLicenseService] Loaded RSA public key from: {}",
                        p.display()
                    );
                    return content;
                }
            }
        }

        DEFAULT_LICENSE_PUBLIC_KEY.to_string()
    }

    pub fn get_license_file_path() -> Option<PathBuf> {
        let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

        if let Ok(custom) = env::var("LICENSE_FILE_PATH") {
            if !custom.trim().is_empty() {
                let p = PathBuf::from(&custom);
                let resolved = if p.is_absolute() { p } else { cwd.join(p) };
                if resolved.is_file() {
                    return Some(resolved);
                }
            }
        }

        let candidates = vec![
            cwd.join("license/lemail-license.lic"),
            cwd.join("../api/license/lemail-license.lic"),
            cwd.join("../../apps/api/license/lemail-license.lic"),
            cwd.join("apps/api/license/lemail-license.lic"),
            cwd.join("../../license/lemail-license.lic"),
            cwd.join("license_dev.lic"),
            cwd.join("../../license_dev.lic"),
        ];

        candidates.into_iter().find(|p| p.is_file())
    }

    /// 라이선스 파일 내용(`trim()`)의 SHA-256 hex 해시 계산 (Node `calculateHash`와 동일)
    pub fn calculate_hash(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.trim().as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Node의 `JSON.stringify(payload, Object.keys(payload).sort())`와
    /// 바이트 단위로 동일한 Canonical JSON 문자열을 생성합니다.
    pub fn canonical_payload_json(payload: &Value) -> Option<String> {
        let obj = payload.as_object()?;
        let sorted: BTreeMap<&String, &Value> = obj.iter().collect();
        serde_json::to_string(&sorted).ok()
    }

    /// RSA-SHA256 (PKCS#1 v1.5) 전자서명 검증
    pub fn verify_signature(data: &str, signature_base64: &str, pub_key_pem: &str) -> bool {
        let public_key = match RsaPublicKey::from_public_key_pem(pub_key_pem) {
            Ok(k) => k,
            Err(e) => {
                error!("[ImapLicenseService] Failed to parse RSA public key: {}", e);
                return false;
            }
        };

        let sig_bytes = match base64::engine::general_purpose::STANDARD.decode(signature_base64.trim()) {
            Ok(b) => b,
            Err(e) => {
                error!("[ImapLicenseService] Invalid base64 signature: {}", e);
                return false;
            }
        };

        let signature = match Signature::try_from(sig_bytes.as_slice()) {
            Ok(s) => s,
            Err(e) => {
                error!("[ImapLicenseService] Invalid RSA signature length: {}", e);
                return false;
            }
        };

        let verifying_key = VerifyingKey::<Sha256>::new(public_key);
        verifying_key.verify(data.as_bytes(), &signature).is_ok()
    }

    pub async fn check_license(&self, force_refresh: bool) -> LicenseStatusResult {
        if !force_refresh {
            if let Some((checked_at, cached)) = self.cache.read().await.as_ref() {
                if checked_at.elapsed() < CACHE_TTL {
                    return cached.clone();
                }
            }
        }

        let result = self.evaluate_license().await;
        *self.cache.write().await = Some((Instant::now(), result.clone()));
        result
    }

    async fn evaluate_license(&self) -> LicenseStatusResult {
        // 1. 활성 사용자 수 집계
        let current_users: i64 = match sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM `user` WHERE is_active = 1",
        )
        .fetch_one(self.db.pool())
        .await
        {
            Ok(cnt) => cnt,
            Err(e) => {
                error!("[ImapLicenseService] Failed to count active users: {}", e);
                return LicenseStatusResult::invalid(format!(
                    "라이선스 확인 중 시스템 오류가 발생했습니다: {e}"
                ));
            }
        };

        // 2. DB에서 활성 라이선스 조회
        let row = match sqlx::query(
            "SELECT license_id, product, organization_name, max_users, expires_at, is_unlimited, file_hash, license_raw, signature \
             FROM system_licenses WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1",
        )
        .fetch_optional(self.db.pool())
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => {
                let mut res = LicenseStatusResult::invalid(
                    "등록된 시스템 라이선스가 없습니다. 정품 LEMail 라이선스를 등록해 주세요.",
                );
                res.current_users = Some(current_users);
                return res;
            }
            Err(e) => {
                error!("[ImapLicenseService] Failed to query system_licenses: {}", e);
                return LicenseStatusResult::invalid(format!(
                    "라이선스 확인 중 시스템 오류가 발생했습니다: {e}"
                ));
            }
        };

        let db_license_id: String = row.try_get("license_id").unwrap_or_default();
        let db_product: String = row.try_get("product").unwrap_or_default();
        let db_org: String = row.try_get("organization_name").unwrap_or_default();
        let db_max_users: i32 = row.try_get("max_users").unwrap_or(0);
        let db_expires_at: Option<NaiveDateTime> = row.try_get("expires_at").ok().flatten();
        let db_is_unlimited: bool = row.try_get("is_unlimited").unwrap_or(false);
        let db_file_hash: String = row.try_get("file_hash").unwrap_or_default();
        let db_license_raw: String = row.try_get("license_raw").unwrap_or_default();
        let db_signature: String = row.try_get("signature").unwrap_or_default();

        // 3. 디스크 라이선스 파일 탐색
        let Some(lic_file_path) = Self::get_license_file_path() else {
            let mut res = LicenseStatusResult::invalid(
                "라이선스 파일과 DB 불일치: 서버 디스크에 라이선스 파일이 누락되었습니다.",
            );
            res.license_id = Some(db_license_id);
            res.organization_name = Some(db_org);
            res.current_users = Some(current_users);
            return res;
        };

        // 4. 디스크 파일 읽기 및 해시 대조
        let file_content = match fs::read_to_string(&lic_file_path) {
            Ok(c) => c,
            Err(e) => {
                let mut res = LicenseStatusResult::invalid(format!(
                    "라이선스 파일을 읽을 수 없습니다: {e}"
                ));
                res.license_id = Some(db_license_id);
                res.organization_name = Some(db_org);
                res.current_users = Some(current_users);
                return res;
            }
        };

        let file_hash = Self::calculate_hash(&file_content);
        if file_hash != db_file_hash {
            let mut res = LicenseStatusResult::invalid(
                "라이선스 무결성 위반: 라이선스 파일 해시가 DB와 일치하지 않습니다 (변조 감지).",
            );
            res.license_id = Some(db_license_id);
            res.organization_name = Some(db_org);
            res.current_users = Some(current_users);
            return res;
        }

        // 5. 파일 구조 파싱 및 제품 식별자 검증
        let parsed: Value = match serde_json::from_str(&file_content) {
            Ok(v) => v,
            Err(_) => {
                let mut res = LicenseStatusResult::invalid("라이선스 파일 포맷이 올바르지 않습니다.");
                res.license_id = Some(db_license_id);
                res.current_users = Some(current_users);
                return res;
            }
        };

        let payload = match parsed.get("payload") {
            Some(p) if p.is_object() => p,
            _ => {
                let mut res = LicenseStatusResult::invalid(
                    "라이선스 파일의 페이로드 또는 서명이 누락되었습니다.",
                );
                res.license_id = Some(db_license_id);
                res.current_users = Some(current_users);
                return res;
            }
        };
        let signature = match parsed.get("signature").and_then(|s| s.as_str()) {
            Some(s) if !s.is_empty() => s,
            _ => {
                let mut res = LicenseStatusResult::invalid(
                    "라이선스 파일의 페이로드 또는 서명이 누락되었습니다.",
                );
                res.license_id = Some(db_license_id);
                res.current_users = Some(current_users);
                return res;
            }
        };

        let payload_product = payload.get("product").and_then(|v| v.as_str()).unwrap_or("");
        if payload_product != "LEMail" {
            let mut res = LicenseStatusResult::invalid(format!(
                "타 제품({})의 라이선스는 LEMail에서 사용할 수 없습니다.",
                if payload_product.is_empty() {
                    "근태관리 등"
                } else {
                    payload_product
                }
            ));
            res.license_id = payload
                .get("licenseId")
                .and_then(|v| v.as_str())
                .map(String::from);
            res.organization_name = payload
                .get("organizationName")
                .and_then(|v| v.as_str())
                .map(String::from);
            res.current_users = Some(current_users);
            return res;
        }

        // 6. 파일 Payload ↔ DB 컬럼 상호 일치 검증
        let is_id_match = payload.get("licenseId").and_then(|v| v.as_str()) == Some(db_license_id.as_str());
        let is_org_match = payload.get("organizationName").and_then(|v| v.as_str()) == Some(db_org.as_str());
        let is_users_match = payload.get("maxUsers").and_then(|v| v.as_i64()) == Some(db_max_users as i64);
        let is_prod_match = payload_product == db_product;
        let is_sig_match = signature == db_signature;

        if !is_id_match || !is_org_match || !is_users_match || !is_prod_match || !is_sig_match {
            let mut res = LicenseStatusResult::invalid(
                "라이선스 파일과 DB 정보가 일치하지 않습니다 (DB 컬럼 변조 감지).",
            );
            res.license_id = Some(db_license_id);
            res.organization_name = Some(db_org);
            res.current_users = Some(current_users);
            return res;
        }

        // 7. DB 내부 서명 원문(license_raw)과 DB 컬럼 대조
        let db_raw_payload: Value = match serde_json::from_str(&db_license_raw) {
            Ok(v) => v,
            Err(_) => {
                let mut res = LicenseStatusResult::invalid(
                    "DB에 저장된 원본 라이선스 데이터가 손상되었습니다.",
                );
                res.license_id = Some(db_license_id);
                res.current_users = Some(current_users);
                return res;
            }
        };

        if db_raw_payload.get("maxUsers").and_then(|v| v.as_i64()) != Some(db_max_users as i64)
            || db_raw_payload.get("organizationName").and_then(|v| v.as_str()) != Some(db_org.as_str())
            || db_raw_payload.get("licenseId").and_then(|v| v.as_str()) != Some(db_license_id.as_str())
            || db_raw_payload.get("product").and_then(|v| v.as_str()) != Some("LEMail")
        {
            let mut res = LicenseStatusResult::invalid(
                "DB 컬럼 정보가 서명 원본과 일치하지 않습니다 (DB 변조 감지).",
            );
            res.license_id = Some(db_license_id);
            res.organization_name = Some(db_org);
            res.current_users = Some(current_users);
            return res;
        }

        // 8. RSA-SHA256 전자서명 수학적 검증
        let pub_key_pem = self.load_public_key().await;
        let canonical = match Self::canonical_payload_json(payload) {
            Some(c) => c,
            None => {
                let mut res = LicenseStatusResult::invalid("라이선스 페이로드 직렬화 실패.");
                res.license_id = Some(db_license_id);
                return res;
            }
        };

        if !Self::verify_signature(&canonical, signature, &pub_key_pem) {
            let mut res = LicenseStatusResult::invalid(
                "라이선스 전자서명 검증에 실패했습니다. 키가 불일치하거나 파일이 변조되었습니다.",
            );
            res.license_id = Some(db_license_id);
            res.organization_name = Some(db_org);
            res.current_users = Some(current_users);
            return res;
        }

        // 9. 사용 기한(expires_at) 검사
        let mut is_expired = false;
        let mut days_remaining: Option<i64> = None;
        let expires_at_iso = db_expires_at.map(|dt| dt.and_utc().to_rfc3339());

        if !db_is_unlimited {
            if let Some(exp_dt) = db_expires_at {
                let diff_ms = exp_dt.and_utc().timestamp_millis() - Utc::now().timestamp_millis();
                let days = (diff_ms as f64 / (1000.0 * 60.0 * 60.0 * 24.0)).ceil() as i64;
                days_remaining = Some(days);
                if diff_ms <= 0 {
                    is_expired = true;
                }
            }
        }

        if is_expired {
            return LicenseStatusResult {
                is_valid: false,
                license_id: Some(db_license_id),
                product: Some(db_product),
                organization_name: Some(db_org),
                max_users: Some(db_max_users),
                current_users: Some(current_users),
                expires_at: expires_at_iso,
                is_unlimited: Some(false),
                is_expired: Some(true),
                days_remaining: Some(0),
                file_integrity_matched: true,
                message: "라이선스 사용 기한이 만료되었습니다.".to_string(),
            };
        }

        // 10. 사용자 정원(max_users) 초과 검사
        if current_users > db_max_users as i64 {
            return LicenseStatusResult {
                is_valid: false,
                license_id: Some(db_license_id),
                product: Some(db_product),
                organization_name: Some(db_org),
                max_users: Some(db_max_users),
                current_users: Some(current_users),
                expires_at: expires_at_iso,
                is_unlimited: Some(db_is_unlimited),
                is_expired: Some(false),
                days_remaining,
                file_integrity_matched: true,
                message: format!(
                    "라이선스 허용 사용자 정원({db_max_users}명)을 초과했습니다. (현재 활성 사용자: {current_users}명)"
                ),
            };
        }

        // 모든 검증 통과
        LicenseStatusResult {
            is_valid: true,
            license_id: Some(db_license_id),
            product: Some(db_product),
            organization_name: Some(db_org),
            max_users: Some(db_max_users),
            current_users: Some(current_users),
            expires_at: expires_at_iso,
            is_unlimited: Some(db_is_unlimited),
            is_expired: Some(false),
            days_remaining,
            file_integrity_matched: true,
            message: "정상 인증된 정품 LEMail 라이선스입니다.".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_real_dev_license_rsa_signature_verification() {
        let lic_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../license_dev.lic");
        if !lic_path.is_file() {
            // CI 등에 개발용 라이선스 파일이 없을 경우 스킵
            return;
        }
        let content = fs::read_to_string(&lic_path).expect("read license_dev.lic");
        let parsed: Value = serde_json::from_str(&content).expect("parse json");
        let payload = parsed.get("payload").expect("payload");
        let signature = parsed
            .get("signature")
            .and_then(|v| v.as_str())
            .expect("signature");

        let canonical = ImapLicenseService::canonical_payload_json(payload).expect("canonical");
        assert!(
            ImapLicenseService::verify_signature(&canonical, signature, DEFAULT_LICENSE_PUBLIC_KEY),
            "Real license_dev.lic signature MUST verify identically to Node!"
        );

        // 페이로드 변조 시 서명 검증 실패 확인
        let mut tampered = payload.clone();
        tampered["maxUsers"] = serde_json::json!(9999);
        let tampered_canonical =
            ImapLicenseService::canonical_payload_json(&tampered).expect("tampered");
        assert!(
            !ImapLicenseService::verify_signature(
                &tampered_canonical,
                signature,
                DEFAULT_LICENSE_PUBLIC_KEY
            ),
            "Tampered payload MUST fail RSA-SHA256 verification"
        );
    }

    #[test]
    fn test_sha256_hash_trims_whitespace() {
        let h1 = ImapLicenseService::calculate_hash("{\"a\":1}");
        let h2 = ImapLicenseService::calculate_hash("  {\"a\":1}\r\n");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
    }
}
