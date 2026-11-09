import * as net from 'net';
import * as tls from 'tls';
import { ImapServerConfig } from '../config/imap-config';
import { TlsManager, TlsCredentials } from './tls-manager';
import { ClientSession } from './client-session';
import { RedisService } from '../services/redis.service';

export class ImapServer {
  private config: ImapServerConfig;
  private plainServer?: net.Server;
  private tlsServer?: tls.Server;
  private tlsCredentials?: TlsCredentials;
  private activeSessions = new Map<string, ClientSession>();
  private metricsInterval?: NodeJS.Timeout;

  constructor(config: ImapServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.tlsCredentials = await TlsManager.getOrCreateCredentials(
      this.config.certPath,
      this.config.keyPath,
    );

    await Promise.all([this.startPlainServer(), this.startTlsServer()]);
    this.startMetricsReporter();
    console.log(
      `[ImapServer] LEMail IMAP services started successfully: Plain/STARTTLS on port ${this.config.port}, IMAPS on port ${this.config.securePort}`,
    );
  }

  private startMetricsReporter(): void {
    this.reportMetrics();
    this.metricsInterval = setInterval(() => {
      this.reportMetrics();
    }, 5000);
  }

  private reportMetrics(): void {
    RedisService.publishMetrics(this.activeSessions.size, this.config.maxConnections).catch((err) => {
      console.warn(`[ImapServer] Failed to report metrics: ${err.message}`);
    });
  }

  private startPlainServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.plainServer = net.createServer((socket) => {
        this.handleNewConnection(socket, false);
      });

      this.plainServer.on('error', (err) => {
        console.error(`[ImapServer] Plain TCP Server Error: ${err.message}`);
        reject(err);
      });

      this.plainServer.listen(this.config.port, this.config.host, () => {
        console.log(
          `[ImapServer] Plain/STARTTLS listening on ${this.config.host}:${this.config.port}`,
        );
        resolve();
      });
    });
  }

  private startTlsServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.tlsCredentials) {
        return reject(new Error('TLS Credentials not initialized'));
      }

      const options: tls.TlsOptions = {
        cert: this.tlsCredentials.cert,
        key: this.tlsCredentials.key,
      };

      this.tlsServer = tls.createServer(options, (socket) => {
        this.handleNewConnection(socket, true);
      });

      this.tlsServer.on('tlsClientError', (err, socket) => {
        const client = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || 0}`;
        console.warn(`[ImapServer] TLS Client Handshake Error from ${client}: ${err.message}`);
      });

      this.tlsServer.on('error', (err) => {
        console.error(`[ImapServer] TLS/IMAPS Server Error: ${err.message}`);
        reject(err);
      });

      this.tlsServer.listen(this.config.securePort, this.config.host, () => {
        console.log(
          `[ImapServer] IMAPS (Direct TLS) listening on ${this.config.host}:${this.config.securePort}`,
        );
        resolve();
      });
    });
  }

  private handleNewConnection(socket: net.Socket | tls.TLSSocket, isTls: boolean) {
    const clientEndpoint = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || 0}`;
    const connType = isTls ? 'IMAPS (Direct TLS)' : 'Plain/STARTTLS';
    console.log(`[ImapServer] New connection attempt from ${clientEndpoint} [${connType}]`);

    if (!this.tlsCredentials) {
      console.warn(`[ImapServer] Connection rejected for ${clientEndpoint}: Server TLS credentials not ready`);
      socket.write('* BYE Server TLS not ready\r\n');
      socket.end();
      return;
    }

    if (this.activeSessions.size >= this.config.maxConnections) {
      console.warn(
        `[ImapServer] Connection rejected for ${clientEndpoint}: Server busy (max connections: ${this.config.maxConnections})`,
      );
      socket.write('* BYE Server is too busy, connection rejected\r\n');
      socket.end();
      return;
    }

    socket.setTimeout(this.config.authTimeoutMs);

    const session = new ClientSession(
      socket,
      isTls,
      this.tlsCredentials,
      () => {
        this.activeSessions.delete(session.id);
        this.reportMetrics();
      },
    );

    this.activeSessions.set(session.id, session);
    this.reportMetrics();
    session.sendWelcome();
  }

  async stop(): Promise<void> {
    console.log('[ImapServer] Shutting down IMAP server...');
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
    await RedisService.clearMetrics();

    for (const [, session] of this.activeSessions) {
      session.write('* BYE Server shutting down\r\n');
    }
    this.activeSessions.clear();

    const closePlain = new Promise<void>((resolve) => {
      if (this.plainServer) {
        this.plainServer.close(() => resolve());
      } else {
        resolve();
      }
    });

    const closeTls = new Promise<void>((resolve) => {
      if (this.tlsServer) {
        this.tlsServer.close(() => resolve());
      } else {
        resolve();
      }
    });

    await Promise.all([closePlain, closeTls]);
    await RedisService.close();
    console.log('[ImapServer] IMAP server stopped cleanly.');
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}
