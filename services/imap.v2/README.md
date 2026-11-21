# LEMail IMAP4rev1 Microservice v2 (Rust)

`services/imap`(Node.js)을 Rust(`tokio` + `tokio-rustls`)로 이식하는 v2 서비스입니다.
기존 `services/imap`과 동일한 포트(`1143` Plain/STARTTLS, `1993` IMAPS), `.env` 설정, MySQL 스키마, Redis 채널, TLS 인증서 및 라이선스 검증 규격을 유지합니다.

## 로컬 빌드 및 테스트

루트 워크스페이스에서 플랫폼(Windows/Linux) 무관하게 실행할 수 있습니다:

```bash
yarn imap:v2:test     # 단위 + 네트워크 통합 테스트
yarn imap:v2:build    # 릴리즈 바이너리 빌드
yarn imap:v2:dev      # 개발 모드 실행
yarn imap:v2:start    # 릴리즈 바이너리 실행
```

## 타겟별 빌드 (Windows / Linux)

- **Windows**: `yarn imap:v2:build` → `target/release/lemail-imap.exe`
- **Linux (`x86_64`)**:
  - Linux 서버에서 직접 `yarn imap:v2:build` → `target/release/lemail-imap`
  - 또는 Windows에서 Docker로 Linux 바이너리 생성:
    ```bash
    docker build -f services/imap.v2/Dockerfile.linux-build --output type=local,dest=services/imap.v2/dist-linux services/imap.v2
    ```

## PM2 및 패키징 전환 방법

- **PM2 실행 전환**: `USE_IMAP_V2=true pm2 start ecosystem.config.js`
- **배포 패키징 전환**: `node scripts/package-dist.js --obfuscate --imap-v2`

## 구현 진행 현황

- [x] **Phase 1**: 프로젝트 스캐폴딩, `.env` 설정 로더, Plain/STARTTLS(`1143`) + IMAPS(`1993`) 듀얼 리스너, TLS 인증서 로드/자동 생성, 기본 IMAP 명령어(`CAPABILITY`, `STARTTLS`, `NOOP`, `LOGOUT`, `NAMESPACE`, `ENABLE`, `CLOSE`, `UNSELECT`)
- [x] **Phase 2**: MySQL(`sqlx`), Redis Pub/Sub 및 메트릭, RSA-SHA256 라이선스 검증, `LOGIN` / `AUTHENTICATE PLAIN`
- [x] **Phase 3**: `FolderHandler` 및 `MessageHandler`
- [x] **Phase 4**: `APPEND`(한글 레거시 인코딩 포함) 및 `IDLE` 실시간 푸시
- [x] **Phase 5**: 릴리즈 빌드 검증, 크로스 플랫폼(Windows/Linux) 빌드 헬퍼, PM2/패키징 opt-in 연동
