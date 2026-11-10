import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { DbService } from '../services/db.service';
import { ImapLicenseService } from '../services/license.service';
import { ClientSession } from '../server/client-session';
import { ImapState, CAPABILITIES_SECURE } from '../protocol/constants';
import { ImapResponse } from '../protocol/imap-response';

export const DEFAULT_SYSTEM_FOLDERS = [
  { name: '받은편지함', type: 'INBOX', sortOrder: 1, isSystem: 1 },
  { name: '보낸편지함', type: 'SENT', sortOrder: 2, isSystem: 1 },
  { name: '임시보관함', type: 'DRAFTS', sortOrder: 3, isSystem: 1 },
  { name: '스팸메일함', type: 'SPAM', sortOrder: 4, isSystem: 1 },
  { name: '휴지통', type: 'TRASH', sortOrder: 5, isSystem: 1 },
  { name: '개인편지함', type: 'CUSTOM', sortOrder: 6, isSystem: 1 },
];

export class AuthHandler {
  static async handleLogin(
    session: ClientSession,
    tag: string,
    username?: string,
    password?: string,
  ): Promise<void> {
    if (session.getState() !== ImapState.NOT_AUTHENTICATED) {
      session.write(ImapResponse.tagged(tag, 'BAD', 'Already authenticated'));
      return;
    }

    if (!username || !password) {
      session.write(
        ImapResponse.tagged(
          tag,
          'BAD',
          'LOGIN requires username and password arguments',
        ),
      );
      return;
    }

    const cleanUsername = (username || '').trim().replace(/^["']|["']$/g, '');
    const cleanPassword = (password || '').replace(/^["']|["']$/g, '');
    const normEmail = cleanUsername.toLowerCase();
    console.log(`[AuthHandler] Login attempt for account "${normEmail}" from ${session.id}`);

    // 시스템 라이선스 유효성 검증 (파일-DB 무결성, 만료, 정원)
    const licenseStatus = await ImapLicenseService.checkLicense();
    if (!licenseStatus.isValid) {
      console.warn(
        `[AuthHandler] Login BLOCKED for "${normEmail}" from ${session.id}: ${licenseStatus.message}`,
      );
      session.write(
        ImapResponse.tagged(
          tag,
          'NO',
          `[UNAVAILABLE] System license required: ${licenseStatus.message}`,
          'SERVERERROR',
        ),
      );
      return;
    }

    try {
      const users = await DbService.query(
        'SELECT id, email, password_hash, name, is_active FROM user WHERE LOWER(email) = ? LIMIT 1',
        [normEmail],
      );

      if (!users || users.length === 0) {
        console.warn(`[AuthHandler] Login FAILED for "${normEmail}" from ${session.id}: User not found`);
        session.write(
          ImapResponse.tagged(
            tag,
            'NO',
            'Invalid login credentials',
            'AUTHENTICATIONFAILED',
          ),
        );
        return;
      }

      const user = users[0];
      if (!user.is_active) {
        console.warn(`[AuthHandler] Login FAILED for "${normEmail}" from ${session.id}: Account is inactive or disabled`);
        session.write(
          ImapResponse.tagged(
            tag,
            'NO',
            'Account is inactive or disabled',
            'AUTHENTICATIONFAILED',
          ),
        );
        return;
      }

      const isMatch = await bcrypt.compare(cleanPassword, user.password_hash);
      if (!isMatch) {
        console.warn(`[AuthHandler] Login FAILED for "${normEmail}" from ${session.id}: Password mismatch`);
        session.write(
          ImapResponse.tagged(
            tag,
            'NO',
            'Invalid login credentials',
            'AUTHENTICATIONFAILED',
          ),
        );
        return;
      }

      // Update last login
      await DbService.query('UPDATE user SET last_login_at = NOW() WHERE id = ?', [user.id]);

      // Ensure default folders exist
      await this.ensureDefaultFolders(user.id);

      session.setUser({
        id: user.id,
        email: user.email,
        name: user.name,
      });

      session.write(
        ImapResponse.tagged(
          tag,
          'OK',
          `Logged in as ${user.email}`,
          `CAPABILITY ${CAPABILITIES_SECURE.join(' ')}`,
        ),
      );
      console.log(`[AuthHandler] Login SUCCESS: User "${user.email}" (ID: ${user.id}) logged in via IMAP from ${session.id}`);
    } catch (err: any) {
      console.error(`[AuthHandler] Error during LOGIN for "${normEmail}" from ${session.id}: ${err.message}`, err);
      session.write(ImapResponse.tagged(tag, 'NO', 'Internal server error during authentication'));
    }
  }

  static async handleAuthenticatePlain(
    session: ClientSession,
    tag: string,
    base64Payload: string,
  ): Promise<void> {
    try {
      const decoded = Buffer.from(base64Payload, 'base64').toString('utf8');
      // Format: [authzid]\0authcid\0passwd
      const parts = decoded.split('\0');
      let username = '';
      let password = '';

      if (parts.length >= 3) {
        username = parts[1];
        password = parts[2];
      } else if (parts.length === 2) {
        username = parts[0];
        password = parts[1];
      }

      console.log(`[AuthHandler] AUTHENTICATE PLAIN attempt for user: "${username}" from ${session.id}`);
      await this.handleLogin(session, tag, username, password);
    } catch (err: any) {
      console.warn(`[AuthHandler] AUTHENTICATE PLAIN failed for ${session.id}: ${err.message}`);
      session.write(
        ImapResponse.tagged(
          tag,
          'NO',
          `AUTHENTICATE failed: ${err.message}`,
          'AUTHENTICATIONFAILED',
        ),
      );
    }
  }

  private static async ensureDefaultFolders(userId: string): Promise<void> {
    const existingFolders = await DbService.query(
      'SELECT type FROM mail_folder WHERE user_id = ?',
      [userId],
    );
    const existingTypes = new Set(existingFolders.map((f: any) => f.type));

    const nowSeconds = Math.floor(Date.now() / 1000);
    for (const def of DEFAULT_SYSTEM_FOLDERS) {
      if (!existingTypes.has(def.type)) {
        await DbService.query(
          `INSERT INTO mail_folder (id, user_id, parent_id, name, type, sort_order, is_system, uidvalidity, uidnext, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
          [
            randomUUID(),
            userId,
            def.name,
            def.type,
            def.sortOrder,
            def.isSystem,
            nowSeconds,
          ],
        );
      }
    }
  }
}
