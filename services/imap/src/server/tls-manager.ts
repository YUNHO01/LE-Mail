import * as fs from 'fs';
import * as path from 'path';
import { generate } from 'selfsigned';

export interface TlsCredentials {
  cert: string;
  key: string;
}

export class TlsManager {
  private static defaultCertDir = path.resolve(__dirname, '../../certs');

  static async getOrCreateCredentials(
    customCertPath?: string,
    customKeyPath?: string,
  ): Promise<TlsCredentials> {
    if (
      customCertPath &&
      customKeyPath &&
      fs.existsSync(customCertPath) &&
      fs.existsSync(customKeyPath)
    ) {
      return {
        cert: fs.readFileSync(customCertPath, 'utf8'),
        key: fs.readFileSync(customKeyPath, 'utf8'),
      };
    }

    const defaultCert = path.join(this.defaultCertDir, 'imap-cert.pem');
    const defaultKey = path.join(this.defaultCertDir, 'imap-key.pem');

    if (fs.existsSync(defaultCert) && fs.existsSync(defaultKey)) {
      return {
        cert: fs.readFileSync(defaultCert, 'utf8'),
        key: fs.readFileSync(defaultKey, 'utf8'),
      };
    }

    // Auto-generate self-signed certificate for dev/local
    console.log('[TlsManager] Generating self-signed TLS certificate for IMAP server...');
    if (!fs.existsSync(this.defaultCertDir)) {
      fs.mkdirSync(this.defaultCertDir, { recursive: true });
    }

    const pems = await generate(
      [
        { name: 'commonName', value: 'localhost' },
        { name: 'organizationName', value: 'LEMail Dev' },
      ],
      { keySize: 2048 },
    );

    fs.writeFileSync(defaultCert, pems.cert, 'utf8');
    fs.writeFileSync(defaultKey, pems.private, 'utf8');
    console.log(`[TlsManager] Self-signed certificates saved to: ${this.defaultCertDir}`);

    return {
      cert: pems.cert,
      key: pems.private,
    };
  }
}
