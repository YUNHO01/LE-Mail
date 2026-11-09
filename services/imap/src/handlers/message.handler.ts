import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { DbService } from '../services/db.service';
import { ClientSession } from '../server/client-session';
import { ImapResponse } from '../protocol/imap-response';
import { ImapUtils } from '../utils/imap-utils';
import { FolderHandler } from './folder.handler';

export interface EnrichedUserMail {
  id: string; // user_mail.id
  userId: string;
  folderId: string;
  messageId: string;
  uid: number;
  isRead: boolean;
  isStarred: boolean;
  isDeleted: boolean;
  isAnswered: boolean;
  isDraft: boolean;
  createdAt: Date;
  seq: number;
  // from mail_message
  sender: string;
  subject: string | null;
  rawFilePath: string;
  mailCreatedAt: Date;
  messageIdHeader: string | null;
}

export class MessageHandler {
  /**
   * Fetch messages in the selected folder ordered by UID ASC
   */
  static async getMailboxMessages(
    userId: string,
    folderId: string,
    includeDeleted = false,
  ): Promise<EnrichedUserMail[]> {
    const deletedCondition = includeDeleted ? '' : 'AND um.is_deleted = false';
    const rows = await DbService.query(
      `SELECT 
        um.id, um.user_id, um.folder_id, um.message_id, um.uid,
        um.is_read, um.is_starred, um.is_deleted, um.is_answered, um.is_draft,
        um.created_at,
        mm.sender, mm.subject, mm.raw_file_path, mm.created_at as mail_created_at,
        mm.message_id as message_id_header
       FROM user_mail um
       JOIN mail_message mm ON mm.id = um.message_id
       WHERE um.user_id = ? AND um.folder_id = ? ${deletedCondition}
       ORDER BY um.uid ASC`,
      [userId, folderId],
    );

    let seq = 1;
    return rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      folderId: r.folder_id,
      messageId: r.message_id,
      uid: r.uid,
      isRead: Boolean(r.is_read),
      isStarred: Boolean(r.is_starred),
      isDeleted: Boolean(r.is_deleted),
      isAnswered: Boolean(r.is_answered),
      isDraft: Boolean(r.is_draft),
      createdAt: new Date(r.created_at),
      seq: seq++,
      sender: r.sender,
      subject: r.subject,
      rawFilePath: r.raw_file_path,
      mailCreatedAt: new Date(r.mail_created_at),
      messageIdHeader: r.message_id_header,
    }));
  }

  /**
   * FETCH and UID FETCH command handler
   */
  static async handleFetch(
    session: ClientSession,
    tag: string,
    sequenceSet: string,
    fetchItemsRaw: string,
    isUid = false,
  ): Promise<void> {
    const user = session.getUser();
    const mailbox = session.getSelectedMailbox();

    if (!user || !mailbox) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Select a mailbox first'));
      return;
    }

    const messages = await this.getMailboxMessages(user.id, mailbox.id);
    if (messages.length === 0) {
      session.write(
        ImapResponse.tagged(tag, 'OK', `${isUid ? 'UID ' : ''}FETCH completed`),
      );
      return;
    }

    const maxVal = isUid
      ? messages[messages.length - 1].uid
      : messages.length;
    const requestedNumbers = ImapUtils.parseSequenceSet(sequenceSet, maxVal);
    const requestedSet = new Set(requestedNumbers);

    const matchingMessages = messages.filter((m) =>
      requestedSet.has(isUid ? m.uid : m.seq),
    );

    // Normalize fetch items
    const upperItems = fetchItemsRaw.toUpperCase().replace(/[()]/g, '');
    let requestedItems = upperItems.split(/\s+/).filter(Boolean);

    // Expand macros
    if (requestedItems.includes('ALL')) {
      requestedItems = ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE', 'ENVELOPE'];
    } else if (requestedItems.includes('FAST')) {
      requestedItems = ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE'];
    } else if (requestedItems.includes('FULL')) {
      requestedItems = ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE', 'ENVELOPE', 'BODY'];
    }

    if (isUid && !requestedItems.includes('UID')) {
      requestedItems.push('UID');
    }

    // Process each message
    for (const msg of matchingMessages) {
      const responseParts: string[] = [];
      let bodyLiteral: Buffer | null = null;
      let bodyItemName = '';

      // Check recipients if ENVELOPE requested
      let toRecipients: string[] = [];
      let ccRecipients: string[] = [];
      let bccRecipients: string[] = [];

      if (requestedItems.includes('ENVELOPE')) {
        const recipients = await DbService.query(
          'SELECT type, address FROM mail_recipient WHERE message_id = ?',
          [msg.messageId],
        );
        for (const r of recipients) {
          if (r.type === 'TO') toRecipients.push(r.address);
          else if (r.type === 'CC') ccRecipients.push(r.address);
          else if (r.type === 'BCC') bccRecipients.push(r.address);
        }
      }

      for (const item of requestedItems) {
        if (item === 'UID') {
          responseParts.push(`UID ${msg.uid}`);
        } else if (item === 'FLAGS') {
          responseParts.push(`FLAGS ${ImapUtils.formatFlags(msg)}`);
        } else if (item === 'INTERNALDATE') {
          responseParts.push(
            `INTERNALDATE "${ImapUtils.formatInternalDate(msg.mailCreatedAt || msg.createdAt)}"`,
          );
        } else if (item === 'RFC822.SIZE') {
          let size = 0;
          if (msg.rawFilePath && fs.existsSync(msg.rawFilePath)) {
            size = fs.statSync(msg.rawFilePath).size;
          }
          responseParts.push(`RFC822.SIZE ${size}`);
        } else if (item === 'ENVELOPE') {
          const envelope = ImapUtils.formatEnvelope({
            date: msg.mailCreatedAt || msg.createdAt,
            subject: msg.subject,
            from: msg.sender,
            to: toRecipients,
            cc: ccRecipients,
            bcc: bccRecipients,
            inReplyTo: null,
            messageId: msg.messageIdHeader,
          });
          responseParts.push(`ENVELOPE ${envelope}`);
        } else if (
          item.startsWith('BODY[]') ||
          item.startsWith('BODY.PEEK[]') ||
          item.startsWith('RFC822')
        ) {
          bodyItemName = item.includes('PEEK') ? 'BODY[]' : item;
          if (msg.rawFilePath && fs.existsSync(msg.rawFilePath)) {
            bodyLiteral = fs.readFileSync(msg.rawFilePath);
          } else {
            bodyLiteral = Buffer.from(
              `From: ${msg.sender}\r\nSubject: ${msg.subject || ''}\r\n\r\n(Empty message body)\r\n`,
            );
          }

          // Mark as \Seen if not PEEK
          if (!item.includes('PEEK') && !msg.isRead) {
            msg.isRead = true;
            await DbService.query(
              'UPDATE user_mail SET is_read = true WHERE id = ?',
              [msg.id],
            );
          }
        }
      }

      // Build fetch line
      if (bodyLiteral) {
        // e.g. * 1 FETCH (FLAGS (\Seen) RFC822.SIZE 1234 BODY[] {1234}\r\n<literal>)
        responseParts.push(`${bodyItemName} {${bodyLiteral.length}}`);
        session.write(`* ${msg.seq} FETCH (${responseParts.join(' ')}\r\n`);
        session.write(bodyLiteral);
        session.write(')\r\n');
      } else {
        session.write(`* ${msg.seq} FETCH (${responseParts.join(' ')})\r\n`);
      }
    }

    session.write(
      ImapResponse.tagged(tag, 'OK', `${isUid ? 'UID ' : ''}FETCH completed`),
    );
  }

  /**
   * STORE and UID STORE command handler
   */
  static async handleStore(
    session: ClientSession,
    tag: string,
    sequenceSet: string,
    action: string,
    flagsRaw: string,
    isUid = false,
  ): Promise<void> {
    const user = session.getUser();
    const mailbox = session.getSelectedMailbox();

    if (!user || !mailbox) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Select a mailbox first'));
      return;
    }

    const messages = await this.getMailboxMessages(user.id, mailbox.id, true);
    if (messages.length === 0) {
      session.write(
        ImapResponse.tagged(tag, 'OK', `${isUid ? 'UID ' : ''}STORE completed`),
      );
      return;
    }

    const maxVal = isUid
      ? messages[messages.length - 1].uid
      : messages.length;
    const requestedNumbers = ImapUtils.parseSequenceSet(sequenceSet, maxVal);
    const requestedSet = new Set(requestedNumbers);

    const matchingMessages = messages.filter((m) =>
      requestedSet.has(isUid ? m.uid : m.seq),
    );

    const upperAction = action.toUpperCase();
    const isSilent = upperAction.endsWith('.SILENT');
    const baseAction = upperAction.replace('.SILENT', ''); // FLAGS, +FLAGS, -FLAGS

    const upperFlags = flagsRaw.toUpperCase();
    const hasSeen = upperFlags.includes('\\SEEN');
    const hasFlagged = upperFlags.includes('\\FLAGGED');
    const hasDeleted = upperFlags.includes('\\DELETED');
    const hasAnswered = upperFlags.includes('\\ANSWERED');
    const hasDraft = upperFlags.includes('\\DRAFT');

    for (const msg of matchingMessages) {
      if (baseAction === 'FLAGS') {
        msg.isRead = hasSeen;
        msg.isStarred = hasFlagged;
        msg.isDeleted = hasDeleted;
        msg.isAnswered = hasAnswered;
        msg.isDraft = hasDraft;
      } else if (baseAction === '+FLAGS') {
        if (hasSeen) msg.isRead = true;
        if (hasFlagged) msg.isStarred = true;
        if (hasDeleted) msg.isDeleted = true;
        if (hasAnswered) msg.isAnswered = true;
        if (hasDraft) msg.isDraft = true;
      } else if (baseAction === '-FLAGS') {
        if (hasSeen) msg.isRead = false;
        if (hasFlagged) msg.isStarred = false;
        if (hasDeleted) msg.isDeleted = false;
        if (hasAnswered) msg.isAnswered = false;
        if (hasDraft) msg.isDraft = false;
      }

      await DbService.query(
        `UPDATE user_mail 
         SET is_read = ?, is_starred = ?, is_deleted = ?, is_answered = ?, is_draft = ? 
         WHERE id = ?`,
        [msg.isRead, msg.isStarred, msg.isDeleted, msg.isAnswered, msg.isDraft, msg.id],
      );

      if (!isSilent) {
        session.write(
          `* ${msg.seq} FETCH (FLAGS ${ImapUtils.formatFlags(msg)} UID ${msg.uid})\r\n`,
        );
      }
    }

    session.write(
      ImapResponse.tagged(tag, 'OK', `${isUid ? 'UID ' : ''}STORE completed`),
    );
  }

  /**
   * SEARCH and UID SEARCH command handler
   */
  static async handleSearch(
    session: ClientSession,
    tag: string,
    criteriaTokens: string[],
    isUid = false,
  ): Promise<void> {
    const user = session.getUser();
    const mailbox = session.getSelectedMailbox();

    if (!user || !mailbox) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Select a mailbox first'));
      return;
    }

    const messages = await this.getMailboxMessages(user.id, mailbox.id, true);
    const upperTokens = criteriaTokens.map((t) => t.toUpperCase().replace(/[()]/g, ''));

    // Filter messages based on criteria
    const matches: EnrichedUserMail[] = [];

    for (const msg of messages) {
      let matched = true;

      for (let i = 0; i < upperTokens.length; i++) {
        const token = upperTokens[i];

        if (token === 'ALL') {
          // match all
        } else if (token === 'UNSEEN') {
          if (msg.isRead) matched = false;
        } else if (token === 'SEEN') {
          if (!msg.isRead) matched = false;
        } else if (token === 'FLAGGED') {
          if (!msg.isStarred) matched = false;
        } else if (token === 'UNFLAGGED') {
          if (msg.isStarred) matched = false;
        } else if (token === 'DELETED') {
          if (!msg.isDeleted) matched = false;
        } else if (token === 'UNDELETED') {
          if (msg.isDeleted) matched = false;
        } else if (token === 'ANSWERED') {
          if (!msg.isAnswered) matched = false;
        } else if (token === 'UNANSWERED') {
          if (msg.isAnswered) matched = false;
        } else if (token === 'DRAFT') {
          if (!msg.isDraft) matched = false;
        } else if (token === 'UNDRAFT') {
          if (msg.isDraft) matched = false;
        } else if (token === 'SUBJECT') {
          const val = upperTokens[++i] || '';
          if (!msg.subject || !msg.subject.toUpperCase().includes(val)) matched = false;
        } else if (token === 'FROM') {
          const val = upperTokens[++i] || '';
          if (!msg.sender || !msg.sender.toUpperCase().includes(val)) matched = false;
        } else if (token === 'UID') {
          const uidSet = upperTokens[++i] || '';
          const maxUid = messages[messages.length - 1].uid;
          const uids = ImapUtils.parseSequenceSet(uidSet, maxUid);
          if (!uids.includes(msg.uid)) matched = false;
        }
      }

      if (matched) {
        matches.push(msg);
      }
    }

    const resultIds = matches.map((m) => (isUid ? m.uid : m.seq));
    session.write(`* SEARCH ${resultIds.join(' ')}\r\n`);
    session.write(
      ImapResponse.tagged(tag, 'OK', `${isUid ? 'UID ' : ''}SEARCH completed`),
    );
  }

  /**
   * EXPUNGE command handler
   */
  static async handleExpunge(session: ClientSession, tag: string): Promise<void> {
    const user = session.getUser();
    const mailbox = session.getSelectedMailbox();

    if (!user || !mailbox) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Select a mailbox first'));
      return;
    }

    // Get all messages including deleted
    const allMessages = await this.getMailboxMessages(user.id, mailbox.id, true);
    const toExpunge = allMessages.filter((m) => m.isDeleted);

    if (toExpunge.length === 0) {
      session.write(ImapResponse.tagged(tag, 'OK', 'EXPUNGE completed'));
      return;
    }

    // Remove deleted messages and report shifted sequence numbers
    let currentShift = 0;
    for (const msg of toExpunge) {
      const expungedSeq = msg.seq - currentShift;
      await DbService.query('DELETE FROM user_mail WHERE id = ?', [msg.id]);
      session.write(`* ${expungedSeq} EXPUNGE\r\n`);
      currentShift++;
    }

    session.write(ImapResponse.tagged(tag, 'OK', 'EXPUNGE completed'));
  }

  /**
   * COPY and MOVE command handler
   */
  static async handleCopyMove(
    session: ClientSession,
    tag: string,
    sequenceSet: string,
    targetMailboxName: string,
    isMove: boolean,
    isUid = false,
  ): Promise<void> {
    const user = session.getUser();
    const mailbox = session.getSelectedMailbox();

    if (!user || !mailbox) {
      session.write(ImapResponse.tagged(tag, 'NO', 'Select a mailbox first'));
      return;
    }

    const targetFolder = await FolderHandler.resolveFolder(user.id, targetMailboxName);
    if (!targetFolder) {
      session.write(
        ImapResponse.tagged(tag, 'NO', `Target mailbox does not exist: ${targetMailboxName}`),
      );
      return;
    }

    const messages = await this.getMailboxMessages(user.id, mailbox.id, false);
    if (messages.length === 0) {
      session.write(
        ImapResponse.tagged(tag, 'OK', `${isUid ? 'UID ' : ''}${isMove ? 'MOVE' : 'COPY'} completed`),
      );
      return;
    }

    const maxVal = isUid
      ? messages[messages.length - 1].uid
      : messages.length;
    const requestedNumbers = ImapUtils.parseSequenceSet(sequenceSet, maxVal);
    const requestedSet = new Set(requestedNumbers);

    const matchingMessages = messages.filter((m) =>
      requestedSet.has(isUid ? m.uid : m.seq),
    );

    for (const msg of matchingMessages) {
      const allocatedUid = targetFolder.uidnext || 1;
      targetFolder.uidnext = allocatedUid + 1;
      await DbService.query('UPDATE mail_folder SET uidnext = ? WHERE id = ?', [
        targetFolder.uidnext,
        targetFolder.id,
      ]);

      if (isMove) {
        await DbService.query(
          'UPDATE user_mail SET folder_id = ?, uid = ? WHERE id = ?',
          [targetFolder.id, allocatedUid, msg.id],
        );
      } else {
        await DbService.query(
          `INSERT INTO user_mail (id, user_id, folder_id, message_id, uid, is_read, is_starred, is_deleted, is_answered, is_draft, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            randomUUID(),
            user.id,
            targetFolder.id,
            msg.messageId,
            allocatedUid,
            msg.isRead,
            msg.isStarred,
            msg.isDeleted,
            msg.isAnswered,
            msg.isDraft,
          ],
        );
      }
    }

    session.write(
      ImapResponse.tagged(
        tag,
        'OK',
        `${isUid ? 'UID ' : ''}${isMove ? 'MOVE' : 'COPY'} completed`,
      ),
    );
  }
}
