---
trigger: always_on
---

# 데이터베이스 스키마 동기화 규칙 (LEMail)

`apps/api`는 TypeORM `synchronize: false`를 사용하며, API 기동 시 `DatabaseModule.onModuleInit()`에서 `apps/api/src/modules/database/scripts/init-schema.ts`의 `syncDatabaseSchema()`를 자동 실행하여 스키마를 동기화합니다.

따라서 소스 수정 시 **테이블 또는 컬럼이 추가·변경되는 모든 작업**에서는 반드시 아래 규칙을 함께 적용해야 합니다:

1. **엔티티 변경 시 `init-schema.ts` 동시 갱신 필수**
   - `apps/api/src/modules/database/entities/*.entity.ts`에 새 엔티티(테이블)를 추가하거나 기존 엔티티에 컬럼을 추가/수정하는 경우, 반드시 같은 작업 내에서 `apps/api/src/modules/database/scripts/init-schema.ts`도 함께 수정합니다.
2. **수정 위치 2곳 모두 반영**
   - 신규 설치 환경용 `schemaStatements` (`CREATE TABLE IF NOT EXISTS ...`)에 테이블 또는 컬럼 정의를 반영합니다.
   - 기존 DB 업그레이드용 `syncDatabaseSchema()` 내부의 멱등 `ALTER TABLE ... ADD COLUMN ...` 목록에도 해당 컬럼 추가 구문을 반드시 추가합니다 (`errno 1060` 중복 컬럼 에러는 자동 무시됨).
3. **검증**
   - 변경 후 `npm --prefix apps/api run schema:init` 실행 또는 API 서버 기동 로그에서 `[SchemaDrift]` 경고가 없는지 확인합니다.
