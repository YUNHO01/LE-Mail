import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DbService } from '../services/db.service';
import { ClientSession } from '../server/client-session';
import { ImapResponse } from '../protocol/imap-response';
import { FolderHandler } from './folder.handler';

export class AppendHandler {
  static async handleAppend(
    session: ClientSession,
    tag: string,
    mailboxName: string,
    flagsRaw: string,
    literalData: Buffer,
  ): Promise<void> {
    const user = session.getUser();
    if (!user) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Please log in first'));
      return;
    }

    const folder = await FolderHandler.resolveFolder(user.id, mailboxName);
    if (!folder) {
      session.write(
        ImapResponse.tagged(
          tag,
          'NO',
          `Mailbox does not exist: ${mailboxName}`,
          'TRYCREATE',
        ),
      );
      return;
    }

    const mailId = randomUUID();
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const archiveBaseDir = path.resolve(
      process.cwd(),
      process.env.MAIL_ARCHIVE_DIR || './mail-archive',
    );
    const targetDir = path.join(archiveBaseDir, year, month, day);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFilePath = path.join(targetDir, `${mailId}.eml`);
    fs.writeFileSync(targetFilePath, literalData);

    // Parse simple headers from raw EML
    const rawText = literalData.toString('utf8', 0, Math.min(literalData.length, 8192));
    const headerEnd = rawText.indexOf('\r\n\r\n');
    const headerBlock = headerEnd !== -1 ? rawText.substring(0, headerEnd) : rawText;

    const fromMatch = headerBlock.match(/^From:\s*(.+)$/im);
    const subjectMatch = headerBlock.match(/^Subject:\s*(.+)$/im);
    const msgIdMatch = headerBlock.match(/^Message-ID:\s*(.+)$/im);
    const toMatch = headerBlock.match(/^To:\s*(.+)$/im);

    const from = fromMatch ? fromMatch[1].trim() : user.email;
    const subject = subjectMatch ? subjectMatch[1].trim() : '(No Subject)';
    const messageIdHeader = msgIdMatch
      ? msgIdMatch[1].trim()
      : `<${mailId}@lemail.local>`;

    // Flags parsing
    const upperFlags = flagsRaw.toUpperCase();
    const isRead = upperFlags.includes('\\SEEN');
    const isStarred = upperFlags.includes('\\FLAGGED');
    const isDeleted = upperFlags.includes('\\DELETED');
    const isAnswered = upperFlags.includes('\\ANSWERED');
    const isDraft = upperFlags.includes('\\DRAFT');

    // 1. Insert mail_message
    await DbService.query(
      `INSERT INTO mail_message (id, direction, message_id, sender, subject, raw_file_path, status, created_at)
       VALUES (?, 'OUTBOUND', ?, ?, ?, ?, 'PROCESSED', NOW())`,
      [mailId, messageIdHeader, from, subject, targetFilePath],
    );

    // 2. Insert recipient if present
    if (toMatch) {
      await DbService.query(
        `INSERT INTO mail_recipient (message_id, type, address)
         VALUES (?, 'TO', ?)`,
        [mailId, toMatch[1].trim()],
      );
    }

    // 3. Allocate UID in target folder
    const allocatedUid = folder.uidnext || 1;
    const nextUid = allocatedUid + 1;
    await DbService.query('UPDATE mail_folder SET uidnext = ? WHERE id = ?', [
      nextUid,
      folder.id,
    ]);

    // 4. Insert user_mail
    const userMailId = randomUUID();
    await DbService.query(
      `INSERT INTO user_mail (id, user_id, folder_id, message_id, uid, is_read, is_starred, is_deleted, is_answered, is_draft, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userMailId,
        user.id,
        folder.id,
        mailId,
        allocatedUid,
        isRead,
        isStarred,
        isDeleted,
        isAnswered,
        isDraft,
      ],
    );

    // Response with RFC 4315 [APPENDUID <uidvalidity> <allocatedUid>]
    session.write(
      ImapResponse.tagged(
        tag,
        'OK',
        'APPEND completed',
        `APPENDUID ${folder.uidvalidity} ${allocatedUid}`,
      ),
    );
    console.log(
      `[AppendHandler] Appended mail ${mailId} (UID: ${allocatedUid}) into folder [${folder.name}] for user ${user.email}`,
    );
  }
}
