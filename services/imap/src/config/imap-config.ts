import './env-loader';
import * as path from 'path';

export interface ImapServerConfig {
  host: string;
  port: number;
  securePort: number;
  enableStartTls: boolean;
  maxConnections: number;
  authTimeoutMs: number;
  certPath?: string;
  keyPath?: string;
  archiveDir: string;
}

export const imapConfig: ImapServerConfig = {
  host: process.env.IMAP_HOST || '0.0.0.0',
  port: parseInt(process.env.IMAP_PORT || '1143', 10),
  securePort: parseInt(process.env.IMAPS_PORT || '1993', 10),
  enableStartTls: process.env.IMAP_STARTTLS !== 'false',
  maxConnections: parseInt(process.env.IMAP_MAX_CONNECTIONS || '200', 10),
  authTimeoutMs: parseInt(process.env.IMAP_AUTH_TIMEOUT_MS || '60000', 10),
  certPath: process.env.IMAP_TLS_CERT,
  keyPath: process.env.IMAP_TLS_KEY,
  archiveDir: path.resolve(
    process.cwd(),
    process.env.MAIL_ARCHIVE_DIR || process.env.ARCHIVE_DIR || './mail-archive',
  ),
};
