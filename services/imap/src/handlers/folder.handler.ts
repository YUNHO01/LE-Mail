import { randomUUID } from 'crypto';
import { DbService } from '../services/db.service';
import { ClientSession } from '../server/client-session';
import { ImapResponse } from '../protocol/imap-response';
import { ImapUtils } from '../utils/imap-utils';

export interface FolderRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  type: string;
  sort_order: number;
  is_system: number | boolean;
  uidvalidity: number;
  uidnext: number;
}

export class FolderHandler {
  static async resolveFolder(userId: string, mailboxName: string): Promise<FolderRow | null> {
    const rawClean = mailboxName.replace(/^["']|["']$/g, '').trim();
    const decodedName = ImapUtils.decodeModifiedUtf7(rawClean).trim();
    const cleanNormalized = decodedName.replace(/\s+/g, '');
    const upper = decodedName.toUpperCase().replace(/\s+/g, '');

    let targetType: string | null = null;
    if (upper === 'INBOX' || cleanNormalized === '받은편지함') {
      targetType = 'INBOX';
    } else if (
      upper === 'SENT' ||
      upper === 'SENTITEMS' ||
      upper === 'SENTMESSAGES' ||
      cleanNormalized === '보낸편지함'
    ) {
      targetType = 'SENT';
    } else if (
      upper === 'DRAFTS' ||
      upper === 'DRAFT' ||
      cleanNormalized === '임시보관함' ||
      cleanNormalized === '임시편지함'
    ) {
      targetType = 'DRAFTS';
    } else if (
      upper === 'TRASH' ||
      upper === 'DELETED' ||
      upper === 'DELETEDITEMS' ||
      upper === 'DELETEDMESSAGES' ||
      cleanNormalized === '휴지통' ||
      cleanNormalized === '지운편지함' ||
      cleanNormalized === '지운항목'
    ) {
      targetType = 'TRASH';
    } else if (
      upper === 'JUNK' ||
      upper === 'SPAM' ||
      upper === 'JUNKEMAIL' ||
      upper === 'JUNKE-MAIL' ||
      cleanNormalized === '스팸메일함' ||
      cleanNormalized === '스팸메일' ||
      cleanNormalized === '정크메일'
    ) {
      targetType = 'SPAM';
    }

    if (targetType) {
      const folders = await DbService.query<FolderRow[]>(
        'SELECT * FROM mail_folder WHERE user_id = ? AND type = ? LIMIT 1',
        [userId, targetType],
      );
      if (folders && folders.length > 0) return folders[0];
    }

    // Lookup by exact or normalized name (both raw and decoded)
    const folders = await DbService.query<FolderRow[]>(
      `SELECT * FROM mail_folder 
       WHERE user_id = ? 
         AND (name = ? OR LOWER(name) = LOWER(?) OR name = ? OR LOWER(name) = LOWER(?)) 
       LIMIT 1`,
      [userId, decodedName, decodedName, rawClean, rawClean],
    );

    return folders && folders.length > 0 ? folders[0] : null;
  }

  static async handleList(
    session: ClientSession,
    tag: string,
    reference = '',
    pattern = '*',
  ): Promise<void> {
    const user = session.getUser();
    if (!user) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Authenticate first'));
      return;
    }

    const cleanPattern = pattern.replace(/^["']|["']$/g, '');

    // Delimiter query: LIST "" ""
    if (cleanPattern === '') {
      session.write('* LIST (\\Noselect) "/" ""\r\n');
      session.write(ImapResponse.tagged(tag, 'OK', 'LIST completed'));
      return;
    }

    const folders = await DbService.query<FolderRow[]>(
      'SELECT * FROM mail_folder WHERE user_id = ? ORDER BY sort_order ASC, name ASC',
      [user.id],
    );

    for (const f of folders) {
      const displayName = this.getFolderDisplayName(f);
      const attributes = this.getFolderAttributes(f);

      session.write(`* LIST (${attributes.join(' ')}) "/" "${displayName}"\r\n`);
    }

    session.write(ImapResponse.tagged(tag, 'OK', 'LIST completed'));
  }

  static async handleLsub(
    session: ClientSession,
    tag: string,
    reference = '',
    pattern = '*',
  ): Promise<void> {
    const user = session.getUser();
    if (!user) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Authenticate first'));
      return;
    }

    const cleanPattern = pattern.replace(/^["']|["']$/g, '');
    if (cleanPattern === '') {
      session.write('* LSUB (\\Noselect) "/" ""\r\n');
      session.write(ImapResponse.tagged(tag, 'OK', 'LSUB completed'));
      return;
    }

    const folders = await DbService.query<FolderRow[]>(
      'SELECT * FROM mail_folder WHERE user_id = ? ORDER BY sort_order ASC, name ASC',
      [user.id],
    );

    for (const f of folders) {
      const displayName = this.getFolderDisplayName(f);
      const attributes = this.getFolderAttributes(f);
      session.write(`* LSUB (${attributes.join(' ')}) "/" "${displayName}"\r\n`);
    }

    session.write(ImapResponse.tagged(tag, 'OK', 'LSUB completed'));
  }

  static async handleStatus(
    session: ClientSession,
    tag: string,
    mailboxName: string,
    statusItems: string[] = ['MESSAGES', 'RECENT', 'UIDNEXT', 'UIDVALIDITY', 'UNSEEN'],
  ): Promise<void> {
    const user = session.getUser();
    if (!user) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Authenticate first'));
      return;
    }

    const folder = await this.resolveFolder(user.id, mailboxName);
    if (!folder) {
      session.write(
        ImapResponse.tagged(tag, 'NO', `Mailbox does not exist: ${mailboxName}`),
      );
      return;
    }

    const counts = await DbService.query(
      `SELECT 
        COUNT(CASE WHEN is_deleted = false THEN 1 END) as messages,
        COUNT(CASE WHEN is_read = false AND is_deleted = false THEN 1 END) as unseen
       FROM user_mail WHERE folder_id = ?`,
      [folder.id],
    );

    const messageCount = Number(counts[0]?.messages || 0);
    const unseenCount = Number(counts[0]?.unseen || 0);

    const resultParts: string[] = [];
    for (const item of statusItems) {
      const upperItem = item.toUpperCase().replace(/[()]/g, '');
      if (upperItem === 'MESSAGES') resultParts.push(`MESSAGES ${messageCount}`);
      else if (upperItem === 'RECENT') resultParts.push('RECENT 0');
      else if (upperItem === 'UIDNEXT') resultParts.push(`UIDNEXT ${folder.uidnext || 1}`);
      else if (upperItem === 'UIDVALIDITY') resultParts.push(`UIDVALIDITY ${folder.uidvalidity || 1}`);
      else if (upperItem === 'UNSEEN') resultParts.push(`UNSEEN ${unseenCount}`);
    }

    const cleanMailbox = mailboxName.replace(/^["']|["']$/g, '');
    session.write(`* STATUS "${cleanMailbox}" (${resultParts.join(' ')})\r\n`);
    session.write(ImapResponse.tagged(tag, 'OK', 'STATUS completed'));
  }

  static async handleSelect(
    session: ClientSession,
    tag: string,
    mailboxName: string,
    isExamine = false,
  ): Promise<void> {
    const user = session.getUser();
    if (!user) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Authenticate first'));
      return;
    }

    const folder = await this.resolveFolder(user.id, mailboxName);
    if (!folder) {
      session.write(
        ImapResponse.tagged(tag, 'NO', `Mailbox does not exist: ${mailboxName}`),
      );
      return;
    }

    const counts = await DbService.query(
      `SELECT 
        COUNT(CASE WHEN is_deleted = false THEN 1 END) as messages,
        COUNT(CASE WHEN is_read = false AND is_deleted = false THEN 1 END) as unseen
       FROM user_mail WHERE folder_id = ?`,
      [folder.id],
    );

    const messageCount = Number(counts[0]?.messages || 0);
    const unseenCount = Number(counts[0]?.unseen || 0);

    // Untagged responses for SELECT/EXAMINE
    session.write(`* ${messageCount} EXISTS\r\n`);
    session.write('* 0 RECENT\r\n');

    if (unseenCount > 0) {
      // Find first unseen sequence number
      const firstUnseenRow = await DbService.query(
        `SELECT seq FROM (
           SELECT id, is_read, ROW_NUMBER() OVER (ORDER BY uid ASC) as seq 
           FROM user_mail WHERE folder_id = ? AND is_deleted = false
         ) t WHERE is_read = false LIMIT 1`,
        [folder.id],
      );
      const firstSeq = firstUnseenRow[0]?.seq || 1;
      session.write(`* OK [UNSEEN ${firstSeq}] First unseen message\r\n`);
    }

    session.write(`* OK [UIDVALIDITY ${folder.uidvalidity || 1}] UIDs valid\r\n`);
    session.write(`* OK [UIDNEXT ${folder.uidnext || 1}] Predicted next UID\r\n`);
    session.write('* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n');
    session.write(
      '* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Permanent flags\r\n',
    );

    session.setSelectedMailbox({
      id: folder.id,
      name: this.getFolderDisplayName(folder),
      isReadOnly: isExamine,
    });

    const completionCode = isExamine ? 'READ-ONLY' : 'READ-WRITE';
    session.write(
      ImapResponse.tagged(
        tag,
        'OK',
        `${isExamine ? 'EXAMINE' : 'SELECT'} completed`,
        completionCode,
      ),
    );
  }

  static async handleCreate(
    session: ClientSession,
    tag: string,
    mailboxName: string,
  ): Promise<void> {
    const user = session.getUser();
    if (!user) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Authenticate first'));
      return;
    }

    const cleanName = mailboxName.replace(/^["']|["']$/g, '').trim();
    const decodedName = ImapUtils.decodeModifiedUtf7(cleanName).trim();
    if (decodedName.toUpperCase() === 'INBOX') {
      session.write(ImapResponse.tagged(tag, 'NO', 'Cannot create INBOX'));
      return;
    }

    const existing = await this.resolveFolder(user.id, decodedName);
    if (existing) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Mailbox already exists', 'ALREADYEXISTS'));
      return;
    }

    const folderId = randomUUID();
    const nowSeconds = Math.floor(Date.now() / 1000);

    await DbService.query(
      `INSERT INTO mail_folder (id, user_id, parent_id, name, type, sort_order, is_system, uidvalidity, uidnext, created_at, updated_at)
       VALUES (?, ?, NULL, ?, 'CUSTOM', 10, 0, ?, 1, NOW(), NOW())`,
      [folderId, user.id, decodedName, nowSeconds],
    );

    session.write(ImapResponse.tagged(tag, 'OK', 'CREATE completed'));
  }

  static async handleDelete(
    session: ClientSession,
    tag: string,
    mailboxName: string,
  ): Promise<void> {
    const user = session.getUser();
    if (!user) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Authenticate first'));
      return;
    }

    const folder = await this.resolveFolder(user.id, mailboxName);
    if (!folder) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Mailbox does not exist'));
      return;
    }

    if (folder.is_system || folder.type !== 'CUSTOM') {
      session.write(ImapResponse.tagged(tag, 'NO', 'Cannot delete system mailboxes'));
      return;
    }

    await DbService.query('DELETE FROM mail_folder WHERE id = ?', [folder.id]);
    session.write(ImapResponse.tagged(tag, 'OK', 'DELETE completed'));
  }

  static async handleRename(
    session: ClientSession,
    tag: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const user = session.getUser();
    if (!user) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Authenticate first'));
      return;
    }

    const folder = await this.resolveFolder(user.id, oldName);
    if (!folder) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Source mailbox does not exist'));
      return;
    }

    if (folder.is_system || folder.type !== 'CUSTOM') {
      session.write(ImapResponse.tagged(tag, 'NO', 'Cannot rename system mailboxes'));
      return;
    }

    const cleanNewName = newName.replace(/^["']|["']$/g, '').trim();
    const decodedNewName = ImapUtils.decodeModifiedUtf7(cleanNewName).trim();
    await DbService.query('UPDATE mail_folder SET name = ?, updated_at = NOW() WHERE id = ?', [
      decodedNewName,
      folder.id,
    ]);

    session.write(ImapResponse.tagged(tag, 'OK', 'RENAME completed'));
  }

  private static getFolderDisplayName(folder: FolderRow): string {
    switch (folder.type) {
      case 'INBOX':
        return 'INBOX';
      case 'SENT':
        return ImapUtils.encodeModifiedUtf7(folder.name || '보낸편지함');
      case 'DRAFTS':
        return ImapUtils.encodeModifiedUtf7(folder.name || '임시보관함');
      case 'TRASH':
        return ImapUtils.encodeModifiedUtf7(folder.name || '휴지통');
      case 'SPAM':
        return ImapUtils.encodeModifiedUtf7(folder.name || '스팸메일함');
      default:
        return ImapUtils.encodeModifiedUtf7(folder.name);
    }
  }

  private static getFolderAttributes(folder: FolderRow): string[] {
    const attrs: string[] = ['\\HasNoChildren'];
    switch (folder.type) {
      case 'SENT':
        attrs.unshift('\\Sent');
        break;
      case 'DRAFTS':
        attrs.unshift('\\Drafts');
        break;
      case 'TRASH':
        attrs.unshift('\\Trash');
        break;
      case 'SPAM':
        attrs.unshift('\\Junk');
        break;
      case 'INBOX':
        attrs.unshift('\\Inbox');
        break;
    }
    return attrs;
  }
}
