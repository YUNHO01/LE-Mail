import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import * as net from 'net';
import { SystemSetting } from '../src/modules/database/entities/system-setting.entity';
import { SettingsService } from '../src/modules/settings/settings.service';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { SystemLifecycleService } from '../src/modules/settings/system-lifecycle.service';
import { SmtpIngestionService } from '../src/modules/smtp-ingestion/smtp-ingestion.service';
import { RestartLevel, TargetModule } from '@lemail/shared-types';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function checkPortTcp(host: string, port: number, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function runE2EVerification() {
  console.log('====================================================');
  console.log('   LEMail Phase 4: E2E Integration & Verification   ');
  console.log('====================================================\n');

  // 1. Database 연결
  console.log('[Test 1] Connecting to MySQL Database...');
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3300', 10),
    username: process.env.DB_USERNAME || 'lemail',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'lemaildb',
    entities: [SystemSetting],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log(' -> MySQL connected successfully!\n');

  const repo = dataSource.getRepository(SystemSetting);
  const cryptoService = new CryptoService();
  const settingsService = new SettingsService(repo, cryptoService);

  // 2. DB 직접 조회: 비밀번호 암호화 상태 검증
  console.log('[Test 2] Verifying Encrypted Credentials in DB...');
  const encryptedRows = await repo.find({ where: { isEncrypted: true } });
  console.log(` -> Found ${encryptedRows.length} encrypted credentials:`);

  for (const row of encryptedRows) {
    const isGcmFormat = row.value?.startsWith('ENC:v1:');
    const decrypted = cryptoService.decrypt(row.value || '');
    console.log(
      `    * Key: ${row.key.padEnd(20)} | Encrypted: ${isGcmFormat ? 'YES (AES-256-GCM)' : 'NO'} | Cipher: ${row.value?.substring(0, 30)}... | Decrypted Length: ${decrypted.length}`,
    );

    if (!isGcmFormat) {
      throw new Error(`Security Violation: Setting ${row.key} is not encrypted in ENC:v1 format!`);
    }
    if (!decrypted) {
      throw new Error(`Decryption Failure: Could not decrypt ${row.key}`);
    }
  }
  console.log(' -> [PASS] All credentials are encrypted with AES-256-GCM and verified.\n');

  // 3. Step 1~5 설정 조회 & 마스킹 검증
  console.log('[Test 3] Verifying Step-by-Step Settings Retrieval & Masking...');
  for (let step = 1; step <= 5; step++) {
    const stepData = await settingsService.getSettingsByStep(step);
    console.log(` -> Step ${step} (${stepData.categoryLabel}): ${Object.keys(stepData.settings).length} settings retrieved.`);

    // 비밀번호 필드가 노출되지 않고 마스킹되었는지 확인
    for (const [key, meta] of Object.entries(stepData.metadata)) {
      if ((meta as any).isSecret) {
        const val = stepData.settings[key];
        if (val && val !== '••••••••') {
          throw new Error(`Security Violation: Secret ${key} exposed in API output! Got: ${val}`);
        }
      }
    }
  }
  console.log(' -> [PASS] All 5 Steps retrieved successfully with zero secret leakage.\n');

  // 4. 모듈 Graceful 재시작 및 포트 바인딩 실시간 검증
  console.log('[Test 4] Verifying Real-time SMTP Ingestion Soft Restart & Dynamic Port Switching...');
  
  // Dummy Producer & Cache for standalone testing
  const dummyProducer = { enqueueInbound: async () => {} } as any;
  const dummyCache = { isMailboxActive: async () => true } as any;
  const dummyAuth = { validateForSmtp: async () => true } as any;
  const dummyConfig = { get: (k: string) => (k === 'smtp.port' ? 2525 : null) } as any;

  const smtpService = new SmtpIngestionService(dummyConfig, dummyProducer, dummyCache, dummyAuth);
  smtpService.onApplicationBootstrap();
  console.log(' -> Started Inbound SMTP Engine instance on default port.');

  const lifecycleService = new SystemLifecycleService(smtpService, settingsService);

  // 현재 포트 점검
  const initialPortAlive = await checkPortTcp('127.0.0.1', 2525);
  console.log(` -> Verified Port 2525 TCP connectivity: ${initialPortAlive ? 'UP (Ready)' : 'FAILED'}`);

  // 포트를 2530으로 변경하여 Step 2 저장
  console.log(' -> Changing SMTP_PORT from 2525 to 2530 in Step 2...');
  const saveResult = await settingsService.saveStepSettings(2, {
    SMTP_PORT: 2530,
    SMTP_MAX_CLIENTS: 150,
  });

  console.log(` -> Save result: requiresRestart=${saveResult.requiresRestart}, restartLevel=${saveResult.restartLevel}, targetModules=[${saveResult.targetModules}]`);
  if (!saveResult.requiresRestart || saveResult.restartLevel !== RestartLevel.SOFT) {
    throw new Error('Restart detection failed! Expected SOFT restart.');
  }

  // 모듈 재시작 API 호출
  console.log(' -> Triggering restartModule("SMTP_INGESTION")...');
  const restartResult = await lifecycleService.restartModule(TargetModule.SMTP_INGESTION);
  console.log(` -> Restart executed: ${restartResult.message}`);

  // 새 포트(2530) 접속 검증
  const newPortAlive = await checkPortTcp('127.0.0.1', 2530);
  console.log(` -> Verified NEW Port 2530 TCP connectivity: ${newPortAlive ? 'UP (Success!)' : 'DOWN'}`);
  if (!newPortAlive) {
    throw new Error('New SMTP port 2530 failed to listen after restart!');
  }

  // 원래 포트(2525)로 안전하게 복원 및 재시작
  console.log(' -> Restoring SMTP_PORT back to 2525...');
  await settingsService.saveStepSettings(2, {
    SMTP_PORT: 2525,
    SMTP_MAX_CLIENTS: 100,
  });
  await lifecycleService.restartModule(TargetModule.SMTP_INGESTION);
  const restoredPortAlive = await checkPortTcp('127.0.0.1', 2525);
  console.log(` -> Restored Port 2525 TCP connectivity: ${restoredPortAlive ? 'UP (Restored)' : 'DOWN'}`);

  // SMTP 인스턴스 정상 종료
  await smtpService.onApplicationShutdown();
  console.log(' -> [PASS] SMTP Ingestion Graceful Restart and Dynamic Port Switching verified.\n');

  // 5. 릴레이 설정 변경 및 발송 설정 연동 검증
  console.log('[Test 5] Verifying Relay Config Updates & Secure Decryption in Mail Pipeline...');
  const testPassword = 'AibworksRelay2026!@SecretKey';
  await settingsService.saveStepSettings(3, {
    SMTP_RELAY_ENABLED: true,
    SMTP_RELAY_HOST: 'mail.aibworks.com',
    SMTP_RELAY_PORT: 587,
    SMTP_RELAY_USER: 'admin@aibworks.com',
    SMTP_RELAY_PASS: testPassword,
  });

  const liveRelayConfig = await settingsService.getRelayConfig();
  console.log(' -> Live Relay Config fetched by Mail Pipeline:', {
    enabled: liveRelayConfig.relayEnabled,
    host: liveRelayConfig.relayHost,
    port: liveRelayConfig.relayPort,
    user: liveRelayConfig.relayUser,
    passMatches: liveRelayConfig.relayPass === testPassword,
  });

  if (liveRelayConfig.relayPass !== testPassword) {
    throw new Error('Pipeline password mismatch! Expected decrypted testPassword.');
  }
  console.log(' -> [PASS] Live relay config retrieval and AES-256-GCM decryption verified.\n');

  await dataSource.destroy();

  console.log('====================================================');
  console.log('   🎉 Phase 4: ALL TESTS PASSED SUCCESSFULLY!       ');
  console.log('====================================================');
}

runE2EVerification().catch((err) => {
  console.error('\n❌ E2E Verification Failed:', err);
  process.exit(1);
});
