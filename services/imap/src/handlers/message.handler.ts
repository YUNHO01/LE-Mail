import * as fs from 'fs';
import * as path from 'path';
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
    let requestedItems = MessageHandler.parseFetchItems(fetchItemsRaw);

    // Expand macros
    const upperItems = requestedItems.map((i) => i.toUpperCase());
    if (upperItems.includes('ALL')) {
      requestedItems = ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE', 'ENVELOPE'];
    } else if (upperItems.includes('FAST')) {
      requestedItems = ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE'];
    } else if (upperItems.includes('FULL')) {
      requestedItems = ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE', 'ENVELOPE', 'BODY'];
    }

    if (isUid && !requestedItems.some((i) => i.toUpperCase() === 'UID')) {
      requestedItems.push('UID');
    }

    const needsRecipients = requestedItems.some(
      (i) => i.toUpperCase() === 'ENVELOPE' || /HEADER/i.test(i) || /^BODY/i.test(i) || /^RFC822/i.test(i),
    );

    // Process each message
    for (const msg of matchingMessages) {
      const responseParts: Array<{ text: string; literal?: Buffer }> = [];

      // Check recipients if ENVELOPE or headers requested
      let toRecipients: string[] = [];
      let ccRecipients: string[] = [];
      let bccRecipients: string[] = [];

      if (needsRecipients) {
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
        const upperItem = item.toUpperCase();

        if (upperItem === 'UID') {
          responseParts.push({ text: `UID ${msg.uid}` });
        } else if (upperItem === 'FLAGS') {
          responseParts.push({ text: `FLAGS ${ImapUtils.formatFlags(msg)}` });
        } else if (upperItem === 'INTERNALDATE') {
          responseParts.push({
            text: `INTERNALDATE "${ImapUtils.formatInternalDate(msg.mailCreatedAt || msg.createdAt)}"`,
          });
        } else if (upperItem === 'RFC822.SIZE') {
          let size = 0;
          const resolved = MessageHandler.resolveRawFilePath(msg.rawFilePath);
          if (resolved && fs.existsSync(resolved)) {
            size = fs.statSync(resolved).size;
          }
          responseParts.push({ text: `RFC822.SIZE ${size}` });
        } else if (upperItem === 'ENVELOPE') {
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
          responseParts.push({ text: `ENVELOPE ${envelope}` });
        } else if (upperItem === 'BODYSTRUCTURE' || upperItem === 'BODY') {
          let size = 0;
          const resolved = MessageHandler.resolveRawFilePath(msg.rawFilePath);
          if (resolved && fs.existsSync(resolved)) {
            size = fs.statSync(resolved).size;
          }
          responseParts.push({
            text: `BODYSTRUCTURE ("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "8BIT" ${size} 100 NIL NIL NIL NIL)`,
          });
        } else if (
          upperItem.startsWith('BODY.PEEK[') ||
          upperItem.startsWith('BODY[') ||
          upperItem === 'RFC822' ||
          upperItem === 'RFC822.HEADER' ||
          upperItem === 'RFC822.TEXT'
        ) {
          // Resolve raw EML buffer
          const resolved = MessageHandler.resolveRawFilePath(msg.rawFilePath);
          let rawEml: Buffer;
          if (resolved && fs.existsSync(resolved)) {
            rawEml = fs.readFileSync(resolved);
          } else {
            const encodedSubject = msg.subject
              ? `=?UTF-8?B?${Buffer.from(msg.subject, 'utf8').toString('base64')}?=`
              : '(No Subject)';
            const dateHeader = new Date(msg.mailCreatedAt || msg.createdAt).toUTCString();
            const toRecipientsStr = toRecipients.length > 0 ? toRecipients.join(', ') : msg.sender;
            rawEml = Buffer.from(
              `From: ${msg.sender}\r\nTo: ${toRecipientsStr}\r\nSubject: ${encodedSubject}\r\nDate: ${dateHeader}\r\nMessage-ID: ${msg.messageIdHeader || `<${msg.id}@lemail.local>`}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n(Message content unavailable)\r\n`,
              'utf8',
            );
          }

          let returnItemName = '';
          let contentBuf: Buffer = rawEml;

          if (upperItem.startsWith('BODY.PEEK[') || upperItem.startsWith('BODY[')) {
            const match = item.match(/^(?:BODY\.PEEK|BODY)\[([^\]]*)\](?:<(\d+)(?:\.(\d+))?>)?/i);
            const section = (match ? match[1] : '').toUpperCase().trim();
            const partialOffset = match && match[2] ? parseInt(match[2], 10) : undefined;
            const partialLength = match && match[3] ? parseInt(match[3], 10) : undefined;

            returnItemName = `BODY[${match ? match[1] : ''}]`;
            if (partialOffset !== undefined) {
              returnItemName += `<${partialOffset}>`;
            }

            if (!section || section === '') {
              contentBuf = rawEml;
            } else if (section === 'HEADER') {
              contentBuf = MessageHandler.extractHeader(rawEml);
            } else if (section.startsWith('HEADER.FIELDS.NOT')) {
              const fieldsMatch = section.match(/\(([^)]+)\)/);
              const fields = fieldsMatch ? fieldsMatch[1].split(/\s+/).filter(Boolean) : [];
              contentBuf = MessageHandler.extractHeaderFields(rawEml, fields, true);
            } else if (section.startsWith('HEADER.FIELDS')) {
              const fieldsMatch = section.match(/\(([^)]+)\)/);
              const fields = fieldsMatch ? fieldsMatch[1].split(/\s+/).filter(Boolean) : [];
              contentBuf = MessageHandler.extractHeaderFields(rawEml, fields, false);
            } else if (section === 'TEXT') {
              contentBuf = MessageHandler.extractText(rawEml);
            } else if (section.endsWith('.MIME')) {
              contentBuf = MessageHandler.extractHeader(rawEml);
            } else {
              contentBuf = rawEml;
            }

            if (partialOffset !== undefined) {
              const start = Math.min(partialOffset, contentBuf.length);
              const end =
                partialLength !== undefined
                  ? Math.min(start + partialLength, contentBuf.length)
                  : contentBuf.length;
              contentBuf = contentBuf.subarray(start, end);
            }

            // Mark as \Seen if not PEEK
            if (!item.toUpperCase().includes('PEEK') && !msg.isRead) {
              msg.isRead = true;
              await DbService.query(
                'UPDATE user_mail SET is_read = true WHERE id = ?',
                [msg.id],
              );
            }
          } else if (upperItem === 'RFC822') {
            returnItemName = 'RFC822';
            contentBuf = rawEml;
            if (!msg.isRead) {
              msg.isRead = true;
              await DbService.query(
                'UPDATE user_mail SET is_read = true WHERE id = ?',
                [msg.id],
              );
            }
          } else if (upperItem === 'RFC822.HEADER') {
            returnItemName = 'RFC822.HEADER';
            contentBuf = MessageHandler.extractHeader(rawEml);
          } else if (upperItem === 'RFC822.TEXT') {
            returnItemName = 'RFC822.TEXT';
            contentBuf = MessageHandler.extractText(rawEml);
            if (!msg.isRead) {
              msg.isRead = true;
              await DbService.query(
                'UPDATE user_mail SET is_read = true WHERE id = ?',
                [msg.id],
              );
            }
          }

          responseParts.push({
            text: `${returnItemName} {${contentBuf.length}}\r\n`,
            literal: contentBuf,
          });
        }
      }

      // Build and send fetch line
      if (responseParts.some((p) => p.literal)) {
        session.write(`* ${msg.seq} FETCH (`);
        for (let idx = 0; idx < responseParts.length; idx++) {
          const part = responseParts[idx];
          if (part.literal) {
            session.write(part.text);
            session.write(part.literal);
          } else {
            session.write(part.text);
          }
          if (idx < responseParts.length - 1) {
            session.write(' ');
          }
        }
        session.write(')\r\n');
      } else {
        const line = responseParts.map((p) => p.text).join(' ');
        session.write(`* ${msg.seq} FETCH (${line})\r\n`);
      }
    }

    session.write(
      ImapResponse.tagged(tag, 'OK', `${isUid ? 'UID ' : ''}FETCH completed`),
    );
  }

  /**
   * Parse IMAP FETCH items preserving brackets and enclosed parenthesis
   * e.g. "UID RFC822.SIZE BODY.PEEK[HEADER.FIELDS (From To Subject)]"
   */
  static parseFetchItems(raw: string): string[] {
    let s = raw.trim();
    if (s.startsWith('(') && s.endsWith(')')) {
      s = s.substring(1, s.length - 1).trim();
    }

    const items: string[] = [];
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;

      const start = i;
      const rest = s.substring(i);
      const isBody = /^(?:BODY\.PEEK|BODY)\[/i.test(rest);

      if (isBody) {
        let depth = 0;
        let j = i;
        while (j < s.length) {
          if (s[j] === '[') depth++;
          else if (s[j] === ']') {
            depth--;
            if (depth === 0) {
              j++;
              if (s[j] === '<') {
                const closeAngle = s.indexOf('>', j);
                if (closeAngle !== -1) {
                  j = closeAngle + 1;
                }
              }
              break;
            }
          }
          j++;
        }
        items.push(s.substring(start, j));
        i = j;
      } else {
        while (i < s.length && !/\s/.test(s[i])) i++;
        items.push(s.substring(start, i));
      }
    }
    return items;
  }

  /**
   * Extract RFC822 / MIME header block from raw EML
   */
  static extractHeader(rawEml: Buffer): Buffer {
    const crlfIndex = rawEml.indexOf('\r\n\r\n');
    if (crlfIndex !== -1) {
      return rawEml.subarray(0, crlfIndex + 4);
    }
    const lfIndex = rawEml.indexOf('\n\n');
    if (lfIndex !== -1) {
      return rawEml.subarray(0, lfIndex + 2);
    }
    return rawEml;
  }

  /**
   * Extract specific header fields from raw EML
   */
  static extractHeaderFields(rawEml: Buffer, fields: string[], notFields = false): Buffer {
    const headerBuf = MessageHandler.extractHeader(rawEml);
    const headerStr = headerBuf.toString('utf8');
    const lines = headerStr.split(/\r?\n/);
    const headers: string[] = [];
    let currentHeader = '';

    for (const line of lines) {
      if (/^[ \t]/.test(line)) {
        if (currentHeader) {
          currentHeader += '\r\n' + line;
        }
      } else {
        if (currentHeader) {
          headers.push(currentHeader);
        }
        currentHeader = line;
      }
    }
    if (currentHeader && currentHeader.trim().length > 0) {
      headers.push(currentHeader);
    }

    const fieldSet = new Set(fields.map((f) => f.toUpperCase()));
    const filtered = headers.filter((h) => {
      const colonIdx = h.indexOf(':');
      if (colonIdx === -1) return false;
      const name = h.substring(0, colonIdx).trim().toUpperCase();
      const matches = fieldSet.has(name);
      return notFields ? !matches : matches;
    });

    return Buffer.from(filtered.join('\r\n') + '\r\n\r\n', 'utf8');
  }

  /**
   * Extract body text from raw EML (everything after header block)
   */
  static extractText(rawEml: Buffer): Buffer {
    const crlfIndex = rawEml.indexOf('\r\n\r\n');
    if (crlfIndex !== -1) {
      return rawEml.subarray(crlfIndex + 4);
    }
    const lfIndex = rawEml.indexOf('\n\n');
    if (lfIndex !== -1) {
      return rawEml.subarray(lfIndex + 2);
    }
    return Buffer.alloc(0);
  }

  /**
   * Resolve raw EML file path across workspace directories
   */
  static resolveRawFilePath(rawFilePath?: string | null): string | null {
    if (!rawFilePath) return null;

    if (fs.existsSync(rawFilePath)) {
      return rawFilePath;
    }

    const fromCwd = path.resolve(process.cwd(), rawFilePath);
    if (fs.existsSync(fromCwd)) {
      return fromCwd;
    }

    const normalized = rawFilePath.replace(/\\/g, '/');
    const mailArchiveIdx = normalized.indexOf('mail-archive/');
    if (mailArchiveIdx !== -1) {
      const subPath = normalized.substring(mailArchiveIdx);
      const candidates = [
        path.resolve(process.cwd(), subPath),
        path.resolve(process.cwd(), '../apps/api', subPath),
        path.resolve(process.cwd(), '../../apps/api', subPath),
        path.resolve(process.cwd(), '../services/imap', subPath),
        path.resolve(process.cwd(), '../../services/imap', subPath),
        path.resolve(__dirname, '../../../apps/api', subPath),
        path.resolve(__dirname, '../../../../apps/api', subPath),
        path.resolve(__dirname, '../../mail-archive', subPath.replace(/^mail-archive\//, '')),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }

    const filename = path.basename(rawFilePath);
    if (filename.endsWith('.eml')) {
      const searchDirs = [
        path.resolve(process.cwd(), 'mail-archive'),
        path.resolve(process.cwd(), '../apps/api/mail-archive'),
        path.resolve(process.cwd(), '../../apps/api/mail-archive'),
        path.resolve(__dirname, '../../../apps/api/mail-archive'),
      ];
      for (const sDir of searchDirs) {
        if (fs.existsSync(sDir)) {
          const found = MessageHandler.findFileRecursively(sDir, filename);
          if (found) return found;
        }
      }
    }

    return null;
  }

  private static findFileRecursively(dir: string, targetFilename: string, maxDepth = 4): string | null {
    if (maxDepth <= 0) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === targetFilename) {
          return fullPath;
        } else if (entry.isDirectory()) {
          const res = MessageHandler.findFileRecursively(fullPath, targetFilename, maxDepth - 1);
          if (res) return res;
        }
      }
    } catch {
      // Ignore directory read errors
    }
    return null;
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
