import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import { ClamavHealthStatusDto } from '@lemail/shared-types';
import { SpamConfigService } from './spam-config.service';

export interface AttachmentScanDetail {
  filename: string;
  isDangerousExt: boolean;
  isMacro: boolean;
  isDoubleExt: boolean;
  isInfected: boolean;
  virusName?: string;
  threatReason?: string;
}

export interface AttachmentScanResult {
  hasThreat: boolean;
  score: number;
  reasons: string[];
  infected: boolean;
  details: AttachmentScanDetail[];
}

@Injectable()
export class AttachmentSecurityService {
  private readonly logger = new Logger(AttachmentSecurityService.name);

  // 실행 및 스크립트 고위험 확장자 목록
  private readonly dangerousExecExtensions = new Set([
    'exe', 'scr', 'bat', 'cmd', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh',
    'ps1', 'ps1xml', 'msi', 'msp', 'pif', 'com', 'hta', 'cpl', 'jar', 'reg',
    'sh', 'bash', 'bin', 'iso', 'img', 'lnk',
  ]);

  // 악성 매크로 포함 오피스 문서 확장자 목록
  private readonly macroExtensions = new Set([
    'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm',
  ]);

  // 이중 확장자 위장 정규식 (예: invoice.pdf.exe, report.docx.vbs)
  private readonly doubleExtensionPattern =
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|hwp|hwpx|txt|rtf|csv|jpg|jpeg|png|gif|zip|rar|7z)\.([a-z0-9]+)$/i;

  private readonly clamavHost: string;
  private readonly clamavPort: number;
  private readonly clamavEnabled: boolean;
  private readonly clamavTimeoutMs: number;

  // ClamAV 미구동/장애 시 메일 수신 지연을 방지하기 위한 서킷 브레이커 (Fail-safe)
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly CIRCUIT_BREAKER_COOLDOWN_MS = 30000; // 30초 쿨다운

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly spamConfigService?: SpamConfigService,
  ) {
    this.clamavHost =
      this.configService.get<string>('CLAMAV_HOST') ||
      process.env.CLAMAV_HOST ||
      '127.0.0.1';
    this.clamavPort = parseInt(
      this.configService.get<string>('CLAMAV_PORT') ||
        process.env.CLAMAV_PORT ||
        '3310',
      10,
    );
    this.clamavEnabled =
      (this.configService.get<string>('CLAMAV_ENABLED') ||
        process.env.CLAMAV_ENABLED ||
        'true') !== 'false';
    this.clamavTimeoutMs = parseInt(
      this.configService.get<string>('CLAMAV_TIMEOUT_MS') ||
        process.env.CLAMAV_TIMEOUT_MS ||
        '3000',
      10,
    );
  }

  get isClamavEnabled(): boolean {
    return this.spamConfigService?.getConfig()?.clamavEnabled ?? this.clamavEnabled;
  }

  get currentHost(): string {
    return this.spamConfigService?.getConfig()?.clamavHost || this.clamavHost;
  }

  get currentPort(): number {
    return this.spamConfigService?.getConfig()?.clamavPort || this.clamavPort;
  }

  get currentTimeoutMs(): number {
    return this.spamConfigService?.getConfig()?.clamavTimeoutMs || this.clamavTimeoutMs;
  }

  /**
   * 단일 파일명에 대한 확장자 및 위장 여부 정적 분석
   */
  checkExtension(filename: string): {
    isDangerousExt: boolean;
    isMacro: boolean;
    isDoubleExt: boolean;
    extension: string;
  } {
    if (!filename) {
      return { isDangerousExt: false, isMacro: false, isDoubleExt: false, extension: '' };
    }

    const cleanName = filename.trim().replace(/[. ]+$/, '').toLowerCase();
    const parts = cleanName.split('.');
    const ext = parts.length > 1 ? parts[parts.length - 1] : '';

    const isDangerousExt = this.dangerousExecExtensions.has(ext);
    const isMacro = this.macroExtensions.has(ext);

    // 이중 확장자 검사
    let isDoubleExt = false;
    const match = cleanName.match(this.doubleExtensionPattern);
    if (match) {
      const finalExt = match[2].toLowerCase();
      if (this.dangerousExecExtensions.has(finalExt) || this.macroExtensions.has(finalExt)) {
        isDoubleExt = true;
      }
    }

    return {
      isDangerousExt,
      isMacro,
      isDoubleExt,
      extension: ext,
    };
  }

  /**
   * ClamAV 데몬 헬스체크 및 연결 상태 검사 (zVERSION\0 질의)
   * 데몬이 미실행 상태이거나 비활성화되어 있어도 예외 없이 안전하게 DTO를 반환합니다.
   */
  async pingClamAV(
    customHost?: string,
    customPort?: number,
    customTimeoutMs = 1500,
  ): Promise<ClamavHealthStatusDto> {
    const isCustom = Boolean(customHost || customPort);
    const targetHost = customHost || this.currentHost;
    const targetPort = customPort || this.currentPort;
    const isEnabled = isCustom ? true : this.isClamavEnabled;

    if (!isEnabled) {
      return {
        enabled: false,
        isHealthy: false,
        host: targetHost,
        port: targetPort,
        errorMessage: 'ClamAV 실시간 백신 검사가 비활성화되어 있습니다.',
        checkedAt: new Date().toISOString(),
      };
    }

    return new Promise<ClamavHealthStatusDto>((resolve) => {
      let resolved = false;
      const socket = new net.Socket();
      const startTime = Date.now();

      const finish = (result: ClamavHealthStatusDto) => {
        if (!resolved) {
          resolved = true;
          try {
            socket.destroy();
          } catch {}
          resolve(result);
        }
      };

      socket.setTimeout(customTimeoutMs);

      socket.on('timeout', () => {
        finish({
          enabled: true,
          isHealthy: false,
          host: targetHost,
          port: targetPort,
          errorMessage: `연결 타임아웃 (${customTimeoutMs}ms 초과)`,
          checkedAt: new Date().toISOString(),
        });
      });

      socket.on('error', (err: any) => {
        finish({
          enabled: true,
          isHealthy: false,
          host: targetHost,
          port: targetPort,
          errorMessage: `데몬 접근 불가 (${err.message})`,
          checkedAt: new Date().toISOString(),
        });
      });

      let responseData = '';
      socket.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      socket.on('end', () => {
        const latencyMs = Math.max(1, Date.now() - startTime);
        const versionStr = responseData.replace(/\0/g, '').trim() || 'ClamAV Connected';
        // 정상 응답 확인 시 서킷 브레이커 리셋
        if (!isCustom) {
          this.consecutiveFailures = 0;
        }
        finish({
          enabled: true,
          isHealthy: true,
          host: targetHost,
          port: targetPort,
          version: versionStr,
          latencyMs,
          checkedAt: new Date().toISOString(),
        });
      });

      try {
        socket.connect(targetPort, targetHost, () => {
          // zVERSION\0 커맨드 전송 (NUL 종단)
          socket.write('zVERSION\0');
        });
      } catch (err: any) {
        finish({
          enabled: true,
          isHealthy: false,
          host: targetHost,
          port: targetPort,
          errorMessage: err.message,
          checkedAt: new Date().toISOString(),
        });
      }
    });
  }

  /**
   * ClamAV TCP 데몬(clamd)에 INSTREAM 프로토콜로 버퍼를 스트리밍하여 악성코드 검사 수행
   * (Windows clamd.exe 및 Linux clamav-daemon 100% 동일 프로토콜 호환)
   * 데몬 미설치/장애 시 메일 수신이 중단되지 않도록 완전한 graceful bypass 보장
   */
  async scanBufferWithClamAV(
    buffer: Buffer,
    filename: string,
  ): Promise<{ isInfected: boolean; virusName?: string; error?: string }> {
    if (!this.isClamavEnabled || !buffer || buffer.length === 0) {
      return { isInfected: false };
    }

    // Circuit Breaker: 최근 연속 N회 실패 시 30초 동안 소켓 접속 시도를 우회하여 수신 지연 0ms 보장
    if (
      this.consecutiveFailures >= this.CIRCUIT_BREAKER_THRESHOLD &&
      Date.now() - this.lastFailureTime < this.CIRCUIT_BREAKER_COOLDOWN_MS
    ) {
      this.logger.debug(
        `ClamAV circuit open (failures: ${this.consecutiveFailures}). Bypassing scan for ${filename}.`,
      );
      return { isInfected: false, error: 'CIRCUIT_OPEN' };
    }

    const host = this.currentHost;
    const port = this.currentPort;
    const timeoutMs = this.currentTimeoutMs;

    return new Promise((resolve) => {
      let resolved = false;
      const socket = new net.Socket();

      const finish = (result: { isInfected: boolean; virusName?: string; error?: string }) => {
        if (!resolved) {
          resolved = true;
          try {
            socket.destroy();
          } catch {}
          resolve(result);
        }
      };

      socket.setTimeout(timeoutMs);

      socket.on('timeout', () => {
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();
        this.logger.debug(
          `ClamAV scan timeout (${timeoutMs}ms) for ${filename}, bypassing.`,
        );
        finish({ isInfected: false, error: 'TIMEOUT' });
      });

      socket.on('error', (err: any) => {
        // ClamAV 데몬이 미실행 상태(ECONNREFUSED)이거나 접근 불가 시 정상 메일 수신이 중단되지 않도록 graceful bypass
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();
        this.logger.debug(
          `ClamAV daemon not reachable (${host}:${port}): ${err.message}. Bypassing AV check.`,
        );
        finish({ isInfected: false, error: err.message });
      });

      let responseData = '';

      socket.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      socket.on('end', () => {
        // 성공적 응답 시 서킷 브레이커 초기화
        this.consecutiveFailures = 0;

        // ClamAV 응답 형식: "stream: OK" 또는 "stream: Eicar-Signature FOUND"
        const foundMatch = responseData.match(/stream:\s*(.+)\s+FOUND/i);
        if (foundMatch) {
          const virusName = foundMatch[1].trim();
          this.logger.warn(`[ClamAV Alert] Virus found in ${filename}: ${virusName}`);
          finish({ isInfected: true, virusName });
        } else {
          finish({ isInfected: false });
        }
      });

      try {
        socket.connect(port, host, () => {
          try {
            // 1. zINSTREAM 커맨드 전송 (NUL 종료)
            socket.write('zINSTREAM\0');

            // 2. 버퍼를 청크(32KB) 단위로 전송: [4바이트 BigEndian 청크길이][청크데이터]
            const CHUNK_SIZE = 32 * 1024;
            let offset = 0;
            while (offset < buffer.length) {
              const end = Math.min(offset + CHUNK_SIZE, buffer.length);
              const chunk = buffer.subarray(offset, end);
              const lenBuf = Buffer.alloc(4);
              lenBuf.writeUInt32BE(chunk.length, 0);
              socket.write(lenBuf);
              socket.write(chunk);
              offset = end;
            }

            // 3. 스트림 종료 표시: 길이 0 (4바이트 NUL)
            socket.write(Buffer.alloc(4, 0));
          } catch (writeErr: any) {
            finish({ isInfected: false, error: writeErr.message });
          }
        });
      } catch (connErr: any) {
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();
        finish({ isInfected: false, error: connErr.message });
      }
    });
  }

  /**
   * 첨부파일 목록 일괄 보안 검사 (위험 확장자, 이중 확장자, 매크로, ClamAV 바이러스)
   */
  async scanAttachments(
    attachments: Array<{
      filename: string;
      contentBase64?: string;
    }>,
  ): Promise<AttachmentScanResult> {
    if (!attachments || attachments.length === 0) {
      return {
        hasThreat: false,
        score: 0,
        reasons: [],
        infected: false,
        details: [],
      };
    }

    let totalScore = 0;
    const reasons: string[] = [];
    let anyInfected = false;
    const details: AttachmentScanDetail[] = [];

    for (const att of attachments) {
      const { isDangerousExt, isMacro, isDoubleExt } = this.checkExtension(att.filename);
      let isInfected = false;
      let virusName: string | undefined;
      const itemThreats: string[] = [];

      // 1. 이중 확장자 위장 (최고 위험: +20점)
      if (isDoubleExt) {
        totalScore += 20.0;
        const msg = `이중 확장자 위장 악성코드 의심 파일 감지 [${att.filename}] (+20.0)`;
        reasons.push(msg);
        itemThreats.push(msg);
      }
      // 2. 단일 실행/스크립트 고위험 확장자 (+15점)
      else if (isDangerousExt) {
        totalScore += 15.0;
        const msg = `실행/스크립트 고위험 확장자 첨부파일 감지 [${att.filename}] (+15.0)`;
        reasons.push(msg);
        itemThreats.push(msg);
      }

      // 3. 매크로 포함 문서 (+8점)
      if (isMacro) {
        totalScore += 8.0;
        const msg = `악성 매크로 포함 가능 오피스 문서 감지 [${att.filename}] (+8.0)`;
        reasons.push(msg);
        itemThreats.push(msg);
      }

      // 4. ClamAV 바이러스 스캔 (버퍼가 존재하는 경우 & 활성화 시)
      if (att.contentBase64 && this.isClamavEnabled) {
        try {
          const buf = Buffer.from(att.contentBase64, 'base64');
          const scan = await this.scanBufferWithClamAV(buf, att.filename);
          if (scan.isInfected) {
            isInfected = true;
            anyInfected = true;
            virusName = scan.virusName;
            totalScore += 30.0;
            const msg = `ClamAV 백신 엔진 바이러스/악성코드 감지 [${scan.virusName || 'Infected'}] in [${att.filename}] (+30.0)`;
            reasons.push(msg);
            itemThreats.push(msg);
          }
        } catch (err: any) {
          this.logger.debug(`Attachment buffer decode/scan error: ${err.message}`);
        }
      }

      details.push({
        filename: att.filename,
        isDangerousExt,
        isMacro,
        isDoubleExt,
        isInfected,
        virusName,
        threatReason: itemThreats.join('; ') || undefined,
      });
    }

    const hasThreat = totalScore > 0 || anyInfected;

    return {
      hasThreat,
      score: Math.round(totalScore * 10) / 10,
      reasons,
      infected: anyInfected,
      details,
    };
  }
}
