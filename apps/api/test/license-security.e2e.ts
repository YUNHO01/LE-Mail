import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function runLicenseVerificationTests() {
  console.log('================================================================');
  console.log('🧪 [LEMail] 라이선스 보안 및 무결성(파일-DB 불일치 방어) 검증 테스트');
  console.log('================================================================\n');

  // MySQL DB 연결
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3300', 10),
    user: process.env.DB_USERNAME || 'lemail',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'lemaildb',
  });

  const candidateLicensePaths = [
    path.resolve(__dirname, '../../../license_dev.lic'),
    path.resolve(process.cwd(), '../license_dev.lic'),
    path.resolve(process.cwd(), 'license_dev.lic'),
    'C:/Work/workspace/lineedge/LEMail/license_dev.lic',
  ];
  const lemailLicensePath = candidateLicensePaths.find((p) => fs.existsSync(p)) || candidateLicensePaths[0];

  const amsLicensePath = path.resolve('c:/Work/workspace/lineedge/ams/license_lineedge.lic');

  // NestJS 모듈 로딩 및 서비스 인스턴스화
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const { LicenseService } = require('../src/modules/license/license.service');
  const licenseService = app.get(LicenseService);

  const serverLicensePath = licenseService.getLicenseFilePath();

  let passed = 0;
  let total = 0;

  function assert(title: string, condition: boolean, detail?: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || ''}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: 정상 LEMail 라이선스 등록 및 검증
    // -------------------------------------------------------------
    console.log('▶ [테스트 1] 정상 LEMail 라이선스 파일 등록');
    const lemailLicContent = fs.readFileSync(lemailLicensePath, 'utf-8');
    const regResult = await licenseService.registerLicense(lemailLicContent);
    assert('정품 LEMail 라이선스 등록 성공', regResult.isValid === true);
    assert('파일-DB 무결성 일치 확인', regResult.fileIntegrityMatched === true);
    assert('제품 식별자 일치 (LEMail)', regResult.product === 'LEMail');
    assert('디스크에 라이선스 파일 저장 확인', fs.existsSync(serverLicensePath));

    // -------------------------------------------------------------
    // Test 2: 근태관리(AMS) 라이선스 파일 업로드 시 차단 검증
    // -------------------------------------------------------------
    console.log('\n▶ [테스트 2] 근태관리(AMS) 라이선스 파일 교차 등록 차단 검증');
    if (fs.existsSync(amsLicensePath)) {
      const amsLicContent = fs.readFileSync(amsLicensePath, 'utf-8');
      let amsBlocked = false;
      let amsErrorMsg = '';
      try {
        await licenseService.registerLicense(amsLicContent);
      } catch (err: any) {
        amsBlocked = true;
        amsErrorMsg = err.message;
      }
      assert(
        '근태관리 라이선스 등록 즉시 차단',
        amsBlocked,
        `기대: 차단 / 실제: ${amsBlocked ? amsErrorMsg : '등록 통과됨'}`,
      );
      assert(
        '타 제품 라이선스 명확한 에러 메시지 반환',
        amsErrorMsg.includes('타 제품') || amsErrorMsg.includes('서명 검증에 실패'),
        amsErrorMsg,
      );
    } else {
      console.log('ℹ️ AMS 라이선스 파일 경로를 찾을 수 없어 가상 AMS 파일로 테스트');
      const fakeAmsLicense = JSON.stringify({
        version: '1.0',
        payload: {
          licenseId: 'LIC-AMS1234',
          organizationName: 'AMS회사',
          maxUsers: 100,
          issuedAt: new Date().toISOString(),
        },
        signature: 'fake-signature',
      });
      let blocked = false;
      try {
        await licenseService.registerLicense(fakeAmsLicense);
      } catch (e: any) {
        blocked = true;
      }
      assert('타 제품 라이선스 등록 즉시 차단', blocked);
    }

    // -------------------------------------------------------------
    // Test 3: 파일 ↔ DB 불일치 방어 검증 (핵심 요구사항!)
    // -------------------------------------------------------------
    console.log('\n▶ [테스트 3-A] DB 컬럼 임의 변조 방어 (max_users 변조 시도)');
    // DB에서 max_users를 200 -> 99999 로 직접 조작
    await conn.query('UPDATE system_licenses SET max_users = 99999 WHERE is_active = 1;');
    const statusTamperedDB = await licenseService.getLicenseStatus();
    assert(
      'DB 컬럼 변조 시 라이선스 비활성화 및 차단',
      statusTamperedDB.isValid === false,
      `상태: ${statusTamperedDB.message}`,
    );
    assert(
      '무결성 불일치 원인 감지',
      statusTamperedDB.message?.includes('일치하지 않습니다') ||
        statusTamperedDB.message?.includes('변조'),
      statusTamperedDB.message,
    );

    // 복구
    await conn.query('UPDATE system_licenses SET max_users = 200 WHERE is_active = 1;');
    const statusRestored = await licenseService.getLicenseStatus();
    assert('DB 원복 시 정상 라이선스 재인식', statusRestored.isValid === true);

    console.log('\n▶ [테스트 3-B] 디스크 라이선스 파일 임의 변조 방어 (파일 수정 시도)');
    const originalFileBytes = fs.readFileSync(serverLicensePath, 'utf-8');
    // 파일 내용 중 "maxUsers": 200 을 "maxUsers": 500 으로 변조
    const tamperedFileContent = originalFileBytes.replace('"maxUsers": 200', '"maxUsers": 500');
    fs.writeFileSync(serverLicensePath, tamperedFileContent, 'utf-8');

    const statusTamperedFile = await licenseService.getLicenseStatus();
    assert(
      '디스크 파일 변조 시 해시 불일치로 즉시 차단',
      statusTamperedFile.isValid === false,
      `상태: ${statusTamperedFile.message}`,
    );
    assert(
      '파일 무결성 위반 메시지 확인',
      statusTamperedFile.message?.includes('해시') || statusTamperedFile.message?.includes('변조'),
      statusTamperedFile.message,
    );

    // 파일 복구
    fs.writeFileSync(serverLicensePath, originalFileBytes, 'utf-8');
    const statusFileRestored = await licenseService.getLicenseStatus();
    assert('파일 원복 시 정상 라이선스 복원', statusFileRestored.isValid === true);

    console.log('\n▶ [테스트 3-C] 디스크 라이선스 파일 삭제 시 방어 (파일 누락)');
    fs.unlinkSync(serverLicensePath);
    const statusMissingFile = await licenseService.getLicenseStatus();
    assert(
      '라이선스 파일 부재 시 즉시 차단',
      statusMissingFile.isValid === false,
      `상태: ${statusMissingFile.message}`,
    );
    assert(
      '파일 부재 메시지 확인',
      statusMissingFile.message?.includes('존재하지 않습니다'),
      statusMissingFile.message,
    );

    // 원본 복원 및 재등록
    fs.writeFileSync(serverLicensePath, originalFileBytes, 'utf-8');
    const statusFinal = await licenseService.getLicenseStatus();
    assert('최종 원복 후 정상 인증 상태 확인', statusFinal.isValid === true);

    // -------------------------------------------------------------
    // Test 4: IMAP 서비스 라이선스 무결성 및 차단 연동 검증
    // -------------------------------------------------------------
    console.log('\n▶ [테스트 4] IMAP 서비스(ImapLicenseService) 라이선스 검증 및 차단 연동');
    const imapServicePath = path.resolve(__dirname, '../../../services/imap/dist/services/license.service');
    const { ImapLicenseService } = require(imapServicePath);
    const imapStatus = await ImapLicenseService.checkLicense(true);
    assert('IMAP 라이선스 정상 인증 확인', imapStatus.isValid === true);
    assert('IMAP 파일-DB 무결성 일치 확인', imapStatus.fileIntegrityMatched === true);
    assert('IMAP 제품 식별자 LEMail 확인', imapStatus.product === 'LEMail');

    // DB 임의 변조 시 IMAP 차단 확인
    await conn.query('UPDATE system_licenses SET max_users = 99999 WHERE is_active = 1;');
    const imapTamperedStatus = await ImapLicenseService.checkLicense(true);
    assert('DB 변조 시 IMAP 서비스 즉시 차단', imapTamperedStatus.isValid === false);
    // 복구
    await conn.query('UPDATE system_licenses SET max_users = 200 WHERE is_active = 1;');
    const imapRestoredStatus = await ImapLicenseService.checkLicense(true);
    assert('DB 원복 시 IMAP 정상 복원', imapRestoredStatus.isValid === true);

    // -------------------------------------------------------------
    // Test 5: Haraka Outbound 릴레이 라이선스 검증 및 차단 연동
    // -------------------------------------------------------------
    console.log('\n▶ [테스트 5] Haraka Outbound MTA(license-checker) 라이선스 검증 및 차단 연동');
    const harakaCheckerPath = path.resolve(__dirname, '../../../services/haraka/license-checker');
    const harakaLicChecker = require(harakaCheckerPath);
    const harakaStatus = harakaLicChecker.checkLicenseSync(true);
    assert('Haraka 라이선스 정상 인증 확인', harakaStatus.isValid === true);

    // 파일 변조 시 Haraka 발송 차단 확인
    fs.writeFileSync(serverLicensePath, tamperedFileContent, 'utf-8');
    const harakaTamperedStatus = harakaLicChecker.checkLicenseSync(true);
    assert('파일 변조 시 Haraka 발송 차단 확인', harakaTamperedStatus.isValid === false);
    // 원복
    fs.writeFileSync(serverLicensePath, originalFileBytes, 'utf-8');
    const harakaRestoredStatus = harakaLicChecker.checkLicenseSync(true);
    assert('파일 원복 시 Haraka 발송 정상 복원', harakaRestoredStatus.isValid === true);

  } finally {
    await conn.end();
    await app.close();
  }

  console.log('\n================================================================');
  console.log(`📊 테스트 결과: ${passed} / ${total} 통과 (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runLicenseVerificationTests().catch((err) => {
  console.error('테스트 실행 실패:', err);
  process.exit(1);
});
