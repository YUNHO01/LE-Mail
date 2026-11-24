import { test, expect } from '@playwright/test';
import { ImapFlow } from 'imapflow';

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASS = process.env.TEST_USER_PASS || '';
const IMAP_HOST = process.env.IMAP_HOST || '127.0.0.1';
const IMAP_PORT = Number(process.env.IMAP_PORT || 1143);
const IMAP_SECURE = process.env.IMAP_SECURE === 'true';
const IMAP_TLS_REJECT_UNAUTHORIZED =
  process.env.IMAP_TLS_REJECT_UNAUTHORIZED === 'true';
const IMAP_POLL_TIMEOUT_MS = Number(process.env.IMAP_POLL_TIMEOUT_MS || 20000);
const IMAP_POLL_INTERVAL_MS = Number(process.env.IMAP_POLL_INTERVAL_MS || 1500);

const E2E_SUBJECT_PREFIX = '[E2E-QA]';

function createImapClient(): ImapFlow {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_SECURE,
    tls: {
      rejectUnauthorized: IMAP_TLS_REJECT_UNAUTHORIZED,
    },
    auth: {
      user: TEST_USER_EMAIL,
      pass: TEST_USER_PASS,
    },
    logger: false,
  });
}

async function pollImapForSubject(
  subjectQuery: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<number[]> {
  const client = createImapClient();
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await client.noop();
      const uids = await client.search({ subject: subjectQuery }, { uid: true });
      if (Array.isArray(uids) && uids.length > 0) {
        return uids;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return [];
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

async function cleanupTestEmails(subjectPrefix: string): Promise<void> {
  if (!TEST_USER_EMAIL || !TEST_USER_PASS) return;

  const client = createImapClient();
  await client.connect();

  try {
    const foldersToClean = ['INBOX', 'Sent'];
    for (const folder of foldersToClean) {
      try {
        const lock = await client.getMailboxLock(folder);
        try {
          const uids = await client.search(
            { subject: subjectPrefix },
            { uid: true },
          );
          if (Array.isArray(uids) && uids.length > 0) {
            await client.messageDelete(uids, { uid: true });
          }
        } finally {
          lock.release();
        }
      } catch {
        // 폴더명이 환경마다 다를 수 있으므로(예: Sent 미존재) 무시하고 계속 진행
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

test.describe('LEMail Webmail E2E & IMAP Protocol QA', () => {
  test.beforeAll(() => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASS) {
      throw new Error(
        '.env.test 파일에 TEST_USER_EMAIL 및 TEST_USER_PASS가 설정되어 있어야 합니다. (.env.test.example 참고)',
      );
    }
  });

  test.afterAll(async () => {
    await cleanupTestEmails(E2E_SUBJECT_PREFIX);
  });

  test('로그인 -> XSS 메일 발송 -> IMAP 도달 폴링 -> UI 렌더링/읽음/보안 검증', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const subjectTag = `${E2E_SUBJECT_PREFIX} #${timestamp}`;
    const normalBodyText = `LEMail E2E QA 정상 본문 테스트 (${timestamp})`;
    const xssPayload =
      '<script>window.__XSS_TRIGGERED__=true;</script><img src=x onerror="window.__XSS_TRIGGERED__=true">';

    // 1. 로그인 검증
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(TEST_USER_EMAIL);
    await page.getByTestId('login-password-input').fill(TEST_USER_PASS);
    await page.getByTestId('login-submit-button').click();

    await expect(page).toHaveURL(/\/mail\/inbox/, { timeout: 15000 });
    await expect(page.getByTestId('mail-refresh-button')).toBeVisible();

    // 2. 메일 발송 및 XSS 페이로드 주입
    await page.getByTestId('sidebar-compose-link').click();
    await expect(page).toHaveURL(/\/mail\/compose/, { timeout: 10000 });

    const toInput = page.getByTestId('recipient-input-to');
    await toInput.fill(TEST_USER_EMAIL);
    await toInput.press('Enter');

    await page.getByTestId('compose-subject-input').fill(subjectTag);

    const editor = page
      .getByTestId('compose-editor-container')
      .locator('.ql-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.type(`${normalBodyText}\n`);
    await editor.type(xssPayload);

    await page.getByTestId('compose-send-button').click();
    await expect(page).toHaveURL(/\/mail\/inbox/, { timeout: 15000 });

    // 3. IMAP 프로토콜 도달 폴링 검증 (최대 20초, 1.5초 간격)
    const arrivedUids = await pollImapForSubject(
      subjectTag,
      IMAP_POLL_TIMEOUT_MS,
      IMAP_POLL_INTERVAL_MS,
    );
    expect(
      arrivedUids.length,
      `IMAP INBOX에서 제목 "${subjectTag}" 메일이 ${IMAP_POLL_TIMEOUT_MS}ms 내에 수신되지 않았습니다.`,
    ).toBeGreaterThan(0);

    // 4. UI 렌더링, 읽음 상태 및 보안(XSS) 검증
    await page.getByTestId('mail-refresh-button').click();

    const targetMailRow = page
      .getByTestId('mail-list-item')
      .filter({ hasText: subjectTag })
      .first();
    await expect(targetMailRow).toBeVisible({ timeout: 15000 });
    await expect(targetMailRow).toHaveAttribute('data-read', 'false');

    await targetMailRow.click();

    await expect(page.getByTestId('mail-viewer-subject')).toContainText(
      subjectTag,
    );

    const mailBodyFrame = page.frameLocator('[data-testid="mail-body-iframe"]');
    await expect(mailBodyFrame.locator('body')).toContainText(normalBodyText);

    // 부모 페이지 및 샌드박스 iframe 내 XSS 미실행 검증
    const parentXssTriggered = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__XSS_TRIGGERED__,
    );
    expect(parentXssTriggered).toBeUndefined();
    await expect(mailBodyFrame.locator('script')).toHaveCount(0);
    await expect(mailBodyFrame.locator('[onerror]')).toHaveCount(0);

    // 상세 뷰어 영역 시각적 회귀(Visual Regression) 스냅샷 비교
    const readingPane = page.getByTestId('mail-reading-pane-container');
    await expect(readingPane).toHaveScreenshot('mail-reading-pane.png', {
      mask: [
        page.getByTestId('mail-viewer-subject'),
        readingPane.locator('time'),
      ],
      maxDiffPixelRatio: 0.05,
    });
  });
});
