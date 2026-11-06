/// <reference path="../types/emailjs-imap-handler.d.ts" />
import * as net from 'net';
import * as tls from 'tls';
import imapHandler from 'emailjs-imap-handler';
import {
  ImapState,
  CAPABILITIES_PLAIN,
  CAPABILITIES_SECURE,
  SERVER_NAME,
} from '../protocol/constants';
import { ImapResponse } from '../protocol/imap-response';
import { TlsCredentials } from './tls-manager';
import { AuthHandler } from '../handlers/auth.handler';
import { FolderHandler } from '../handlers/folder.handler';
import { MessageHandler } from '../handlers/message.handler';
import { AppendHandler } from '../handlers/append.handler';
import { RedisService, MailboxEventListener } from '../services/redis.service';
import { DbService } from '../services/db.service';
import { ImapUtils } from '../utils/imap-utils';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface SelectedMailbox {
  id: string;
  name: string;
  isReadOnly: boolean;
}

interface PendingLiteral {
  tag: string;
  command: string;
  rawHeaderLine: string;
  length: number;
}

export class ClientSession {
  public readonly id: string;
  private socket: net.Socket | tls.TLSSocket;
  private isTls: boolean;
  private tlsCredentials: TlsCredentials;
  private state: ImapState = ImapState.NOT_AUTHENTICATED;
  private stringBuffer = '';
  private user: AuthenticatedUser | null = null;
  private selectedMailbox: SelectedMailbox | null = null;
  private pendingAuthMechanism: string | null = null;
  private pendingAuthTag = '';
  private pendingLiteral: PendingLiteral | null = null;
  private literalBuffer: Buffer = Buffer.alloc(0);
  private isIdling = false;
  private idleTag = '';
  private idleListener: MailboxEventListener | null = null;
  private onCloseCallback?: () => void;

  constructor(
    socket: net.Socket | tls.TLSSocket,
    isTls: boolean,
    tlsCredentials: TlsCredentials,
    onClose?: () => void,
  ) {
    this.id = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || 0}`;
    this.socket = socket;
    this.isTls = isTls;
    this.tlsCredentials = tlsCredentials;
    this.onCloseCallback = onClose;

    this.bindSocketEvents();
  }

  private bindSocketEvents() {
    this.socket.on('data', (chunk) => this.handleData(chunk));
    this.socket.on('error', (err) => this.handleError(err));
    this.socket.on('close', () => this.handleClose());
    this.socket.on('timeout', () => this.handleTimeout());
  }

  sendWelcome() {
    const caps = this.isTls ? CAPABILITIES_SECURE : CAPABILITIES_PLAIN;
    const welcome = ImapResponse.untagged(
      'OK',
      SERVER_NAME,
      `CAPABILITY ${caps.join(' ')}`,
    );
    this.write(welcome);
  }

  write(data: string) {
    if (this.socket.writable) {
      this.socket.write(data);
    }
  }

  private handleData(chunk: Buffer) {
    // If waiting for literal data stream (e.g. APPEND message body)
    if (this.pendingLiteral) {
      this.literalBuffer = Buffer.concat([this.literalBuffer, chunk]);

      if (this.literalBuffer.length >= this.pendingLiteral.length) {
        const literalData = this.literalBuffer.slice(0, this.pendingLiteral.length);
        const remainder = this.literalBuffer.slice(this.pendingLiteral.length);

        const pending = this.pendingLiteral;
        this.pendingLiteral = null;
        this.literalBuffer = Buffer.alloc(0);

        this.processLiteral(pending, literalData);

        // Put remainder back into string buffer if any
        if (remainder.length > 0) {
          const remStr = remainder.toString('utf8').replace(/^[\r\n]+/, '');
          if (remStr.length > 0) {
            this.handleData(Buffer.from(remStr, 'utf8'));
          }
        }
      }
      return;
    }

    this.stringBuffer += chunk.toString('utf8');

    while (true) {
      const crlfIndex = this.stringBuffer.indexOf('\r\n');
      const lfIndex = this.stringBuffer.indexOf('\n');
      const newlineIndex = crlfIndex !== -1 ? crlfIndex : lfIndex;

      if (newlineIndex === -1) {
        break; // Wait for full line
      }

      const line = this.stringBuffer.substring(0, newlineIndex).trim();
      const delimiterLength =
        crlfIndex !== -1 && crlfIndex === newlineIndex ? 2 : 1;
      this.stringBuffer = this.stringBuffer.substring(newlineIndex + delimiterLength);

      if (line.length > 0) {
        this.processLine(line);
      }
    }
  }

  private async processLine(rawLine: string) {
    // 1. If currently IDLE, client sends 'DONE' to finish idling
    if (this.isIdling) {
      if (rawLine.toUpperCase() === 'DONE') {
        await this.stopIdle();
      }
      return;
    }

    // 2. If pending AUTHENTICATE continuation
    if (this.pendingAuthMechanism) {
      const mechanism = this.pendingAuthMechanism;
      const tag = this.pendingAuthTag;
      this.pendingAuthMechanism = null;
      this.pendingAuthTag = '';

      if (rawLine === '*') {
        this.write(ImapResponse.tagged(tag, 'BAD', 'Authentication aborted'));
        return;
      }

      if (mechanism === 'PLAIN') {
        AuthHandler.handleAuthenticatePlain(this, tag, rawLine);
      }
      return;
    }

    // 3. Check for literal syntax at end of line (e.g. {342})
    const literalMatch = rawLine.match(/\{(\d+)\}\s*$/);
    if (literalMatch) {
      const literalLength = parseInt(literalMatch[1], 10);
      const tag = rawLine.split(' ')[0] || '*';
      const command = (rawLine.split(' ')[1] || '').toUpperCase();

      this.pendingLiteral = {
        tag,
        command,
        rawHeaderLine: rawLine,
        length: literalLength,
      };
      this.literalBuffer = Buffer.alloc(0);
      this.write(ImapResponse.continuation('Ready for literal data'));
      return;
    }

    // 4. Regular IMAP command line
    let tag = '';
    let command = '';
    let parsed: any = null;

    try {
      parsed = imapHandler.parser(rawLine);
      tag = parsed.tag || '*';
      command = (parsed.command || '').toUpperCase();
    } catch {
      const parts = rawLine.split(' ');
      tag = parts[0] || '*';
      command = (parts[1] || '').toUpperCase();
      parsed = {
        tag,
        command,
        attributes: parts.slice(2).map((p) => ({ type: 'ATOM', value: p })),
      };
    }

    this.dispatchCommand(tag, command, parsed, rawLine);
  }

  private async processLiteral(pending: PendingLiteral, literalData: Buffer) {
    if (pending.command === 'APPEND') {
      const tokens = ImapUtils.parseSearchCriteria(
        pending.rawHeaderLine.replace(/\{(\d+)\}\s*$/, '').trim(),
      );
      const mailboxName = tokens[2] || 'INBOX';
      const flagsRaw = tokens.slice(3).join(' ');
      await AppendHandler.handleAppend(this, pending.tag, mailboxName, flagsRaw, literalData);
    } else {
      this.write(
        ImapResponse.tagged(
          pending.tag,
          'BAD',
          `Literal data unexpected for command: ${pending.command}`,
        ),
      );
    }
  }

  private async dispatchCommand(
    tag: string,
    command: string,
    parsed: any,
    rawLine: string,
  ) {
    const attrs = parsed.attributes || [];

    switch (command) {
      case 'CAPABILITY':
        this.handleCapability(tag);
        break;

      case 'STARTTLS':
        this.handleStartTls(tag);
        break;

      case 'NOOP':
        this.handleNoop(tag);
        break;

      case 'LOGOUT':
        this.handleLogout(tag);
        break;

      // --- Authentication ---
      case 'LOGIN': {
        const username = this.getAttrString(attrs, 0);
        const password = this.getAttrString(attrs, 1);
        await AuthHandler.handleLogin(this, tag, username, password);
        break;
      }

      case 'AUTHENTICATE': {
        const mechanism = this.getAttrString(attrs, 0).toUpperCase();
        const initialResponse = this.getAttrString(attrs, 1);

        if (mechanism !== 'PLAIN') {
          this.write(
            ImapResponse.tagged(
              tag,
              'NO',
              `Unsupported authentication mechanism: ${mechanism}`,
            ),
          );
          break;
        }

        if (initialResponse) {
          await AuthHandler.handleAuthenticatePlain(this, tag, initialResponse);
        } else {
          this.pendingAuthMechanism = 'PLAIN';
          this.pendingAuthTag = tag;
          this.write(ImapResponse.continuation(''));
        }
        break;
      }

      // --- Mailbox / Folders (Requires Authentication) ---
      case 'LIST': {
        if (!this.requireAuth(tag)) break;
        const ref = this.getAttrString(attrs, 0, '');
        const pat = this.getAttrString(attrs, 1, '*');
        await FolderHandler.handleList(this, tag, ref, pat);
        break;
      }

      case 'LSUB': {
        if (!this.requireAuth(tag)) break;
        const ref = this.getAttrString(attrs, 0, '');
        const pat = this.getAttrString(attrs, 1, '*');
        await FolderHandler.handleLsub(this, tag, ref, pat);
        break;
      }

      case 'STATUS': {
        if (!this.requireAuth(tag)) break;
        const mailbox = this.getAttrString(attrs, 0);
        let statusItems: string[] = [];
        const match = rawLine.match(/\(([^)]+)\)/);
        if (match) {
          statusItems = match[1].split(/\s+/).filter(Boolean);
        } else {
          statusItems = this.getAttrList(attrs, 1);
        }
        await FolderHandler.handleStatus(this, tag, mailbox, statusItems);
        break;
      }

      case 'SELECT': {
        if (!this.requireAuth(tag)) break;
        const mailbox = this.getAttrString(attrs, 0);
        await FolderHandler.handleSelect(this, tag, mailbox, false);
        break;
      }

      case 'EXAMINE': {
        if (!this.requireAuth(tag)) break;
        const mailbox = this.getAttrString(attrs, 0);
        await FolderHandler.handleSelect(this, tag, mailbox, true);
        break;
      }

      case 'CREATE': {
        if (!this.requireAuth(tag)) break;
        const mailbox = this.getAttrString(attrs, 0);
        await FolderHandler.handleCreate(this, tag, mailbox);
        break;
      }

      case 'DELETE': {
        if (!this.requireAuth(tag)) break;
        const mailbox = this.getAttrString(attrs, 0);
        await FolderHandler.handleDelete(this, tag, mailbox);
        break;
      }

      case 'RENAME': {
        if (!this.requireAuth(tag)) break;
        const oldName = this.getAttrString(attrs, 0);
        const newName = this.getAttrString(attrs, 1);
        await FolderHandler.handleRename(this, tag, oldName, newName);
        break;
      }

      case 'SUBSCRIBE':
      case 'UNSUBSCRIBE': {
        if (!this.requireAuth(tag)) break;
        this.write(ImapResponse.tagged(tag, 'OK', `${command} completed`));
        break;
      }

      case 'NAMESPACE': {
        this.write('* NAMESPACE (("" "/")) NIL NIL\r\n');
        this.write(ImapResponse.tagged(tag, 'OK', 'NAMESPACE completed'));
        break;
      }

      case 'ENABLE': {
        this.write(ImapResponse.tagged(tag, 'OK', 'ENABLE completed'));
        break;
      }

      case 'CLOSE':
      case 'UNSELECT': {
        if (!this.requireAuth(tag)) break;
        this.selectedMailbox = null;
        this.state = ImapState.AUTHENTICATED;
        this.write(ImapResponse.tagged(tag, 'OK', `${command} completed`));
        break;
      }

      // --- Messages (Selected Mailbox) ---
      case 'FETCH': {
        if (!this.requireAuth(tag)) break;
        const sequenceSet = this.getAttrString(attrs, 0);
        const rawAfterSeq = rawLine.substring(rawLine.indexOf(sequenceSet) + sequenceSet.length).trim();
        await MessageHandler.handleFetch(this, tag, sequenceSet, rawAfterSeq, false);
        break;
      }

      case 'STORE': {
        if (!this.requireAuth(tag)) break;
        const sequenceSet = this.getAttrString(attrs, 0);
        const action = this.getAttrString(attrs, 1);
        const rawAfterAction = rawLine.substring(rawLine.indexOf(action) + action.length).trim();
        await MessageHandler.handleStore(this, tag, sequenceSet, action, rawAfterAction, false);
        break;
      }

      case 'SEARCH': {
        if (!this.requireAuth(tag)) break;
        const allTokens = ImapUtils.parseSearchCriteria(rawLine);
        const searchIdx = allTokens.findIndex((t) => t.toUpperCase() === 'SEARCH');
        const criteria = searchIdx !== -1 ? allTokens.slice(searchIdx + 1) : [];
        await MessageHandler.handleSearch(this, tag, criteria, false);
        break;
      }

      case 'EXPUNGE': {
        if (!this.requireAuth(tag)) break;
        await MessageHandler.handleExpunge(this, tag);
        break;
      }

      case 'COPY': {
        if (!this.requireAuth(tag)) break;
        const sequenceSet = this.getAttrString(attrs, 0);
        const targetMailbox = this.getAttrString(attrs, 1);
        await MessageHandler.handleCopyMove(this, tag, sequenceSet, targetMailbox, false, false);
        break;
      }

      case 'MOVE': {
        if (!this.requireAuth(tag)) break;
        const sequenceSet = this.getAttrString(attrs, 0);
        const targetMailbox = this.getAttrString(attrs, 1);
        await MessageHandler.handleCopyMove(this, tag, sequenceSet, targetMailbox, true, false);
        break;
      }

      case 'UID': {
        if (!this.requireAuth(tag)) break;
        const subCommand = this.getAttrString(attrs, 0).toUpperCase();
        const sequenceSet = this.getAttrString(attrs, 1);

        if (subCommand === 'FETCH') {
          const rawAfterSeq = rawLine.substring(rawLine.indexOf(sequenceSet) + sequenceSet.length).trim();
          await MessageHandler.handleFetch(this, tag, sequenceSet, rawAfterSeq, true);
        } else if (subCommand === 'STORE') {
          const action = this.getAttrString(attrs, 2);
          const rawAfterAction = rawLine.substring(rawLine.indexOf(action) + action.length).trim();
          await MessageHandler.handleStore(this, tag, sequenceSet, action, rawAfterAction, true);
        } else if (subCommand === 'SEARCH') {
          const allTokens = ImapUtils.parseSearchCriteria(rawLine);
          const searchIdx = allTokens.findIndex((t) => t.toUpperCase() === 'SEARCH');
          const criteria = searchIdx !== -1 ? allTokens.slice(searchIdx + 1) : [];
          await MessageHandler.handleSearch(this, tag, criteria, true);
        } else if (subCommand === 'COPY') {
          const targetMailbox = this.getAttrString(attrs, 2);
          await MessageHandler.handleCopyMove(this, tag, sequenceSet, targetMailbox, false, true);
        } else if (subCommand === 'MOVE') {
          const targetMailbox = this.getAttrString(attrs, 2);
          await MessageHandler.handleCopyMove(this, tag, sequenceSet, targetMailbox, true, true);
        } else if (subCommand === 'EXPUNGE') {
          await MessageHandler.handleExpunge(this, tag);
        } else {
          this.write(ImapResponse.tagged(tag, 'BAD', `Unknown UID subcommand: ${subCommand}`));
        }
        break;
      }

      // --- Real-time Push (IDLE) ---
      case 'IDLE': {
        if (!this.requireAuth(tag)) break;
        if (!this.selectedMailbox) {
          this.write(ImapResponse.tagged(tag, 'NO', 'Select a mailbox first'));
          break;
        }

        this.isIdling = true;
        this.idleTag = tag;
        this.write(ImapResponse.continuation('idling'));

        this.idleListener = async (event) => {
          if (this.selectedMailbox && event.folderId === this.selectedMailbox.id) {
            const counts = await DbService.query(
              'SELECT COUNT(*) as count FROM user_mail WHERE folder_id = ? AND is_deleted = false',
              [this.selectedMailbox.id],
            );
            const count = counts[0]?.count || 0;
            this.write(`* ${count} EXISTS\r\n* 1 RECENT\r\n`);
          }
        };

        await RedisService.subscribeUser(this.user!.id, this.idleListener);
        break;
      }

      default:
        this.write(
          ImapResponse.tagged(
            tag,
            'BAD',
            `Command '${command}' not yet supported`,
          ),
        );
        break;
    }
  }

  private async stopIdle() {
    if (this.isIdling) {
      if (this.idleListener && this.user) {
        await RedisService.unsubscribeUser(this.user.id, this.idleListener).catch(() => {});
        this.idleListener = null;
      }
      this.isIdling = false;
      this.write(ImapResponse.tagged(this.idleTag, 'OK', 'IDLE terminated'));
    }
  }

  private requireAuth(tag: string): boolean {
    if (this.state === ImapState.NOT_AUTHENTICATED || !this.user) {
      this.write(ImapResponse.tagged(tag, 'NO', 'Please log in first'));
      return false;
    }
    return true;
  }

  private getAttrString(attrs: any[], index: number, defaultValue = ''): string {
    if (!attrs || attrs.length <= index) return defaultValue;
    const item = attrs[index];
    if (typeof item === 'string') return item;
    if (item && item.value !== undefined) {
      if (Array.isArray(item.value)) {
        return item.value.map((v: any) => (v.value !== undefined ? v.value : v)).join(' ');
      }
      return String(item.value);
    }
    return String(item);
  }

  private getAttrList(attrs: any[], index: number): string[] {
    if (!attrs || attrs.length <= index) return [];
    const item = attrs[index];
    if (Array.isArray(item)) {
      return item.map((v) => (v && v.value !== undefined ? String(v.value) : String(v)));
    }
    if (item && Array.isArray(item.value)) {
      return item.value.map((v: any) => (v && v.value !== undefined ? String(v.value) : String(v)));
    }
    if (typeof item === 'string') return [item];
    return [String(item.value || item)];
  }

  private handleCapability(tag: string) {
    const caps = this.isTls ? CAPABILITIES_SECURE : CAPABILITIES_PLAIN;
    this.write(ImapResponse.capability(caps));
    this.write(ImapResponse.tagged(tag, 'OK', 'CAPABILITY completed'));
  }

  private handleNoop(tag: string) {
    this.write(ImapResponse.tagged(tag, 'OK', 'NOOP completed'));
  }

  private handleLogout(tag: string) {
    this.state = ImapState.LOGOUT;
    this.write(ImapResponse.untagged('BYE', 'LEMail IMAP4rev1 Server logging out'));
    this.write(ImapResponse.tagged(tag, 'OK', 'LOGOUT completed'));
    this.socket.end();
  }

  private handleStartTls(tag: string) {
    if (this.isTls) {
      this.write(ImapResponse.tagged(tag, 'BAD', 'Already in TLS / SSL mode'));
      return;
    }

    this.write(ImapResponse.tagged(tag, 'OK', 'Begin TLS negotiation now'));

    const secureContext = tls.createSecureContext({
      cert: this.tlsCredentials.cert,
      key: this.tlsCredentials.key,
    });

    const tlsSocket = new tls.TLSSocket(this.socket, {
      isServer: true,
      secureContext,
    });

    this.socket.removeAllListeners();
    this.socket = tlsSocket;
    this.isTls = true;
    this.bindSocketEvents();
  }

  private handleError(err: any) {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
      return;
    }
    console.warn(`[ClientSession ${this.id}] Socket error: ${err.message}`);
  }

  private async handleClose() {
    if (this.idleListener && this.user) {
      await RedisService.unsubscribeUser(this.user.id, this.idleListener).catch(() => {});
      this.idleListener = null;
    }
    this.state = ImapState.LOGOUT;
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  private handleTimeout() {
    this.write(ImapResponse.untagged('BYE', 'Connection timed out'));
    this.socket.end();
  }

  getState(): ImapState {
    return this.state;
  }

  setState(state: ImapState) {
    this.state = state;
  }

  getUser(): AuthenticatedUser | null {
    return this.user;
  }

  setUser(user: AuthenticatedUser) {
    this.user = user;
    this.state = ImapState.AUTHENTICATED;
  }

  getSelectedMailbox(): SelectedMailbox | null {
    return this.selectedMailbox;
  }

  setSelectedMailbox(mailbox: SelectedMailbox | null) {
    this.selectedMailbox = mailbox;
    this.state = mailbox ? ImapState.SELECTED : ImapState.AUTHENTICATED;
  }
}
