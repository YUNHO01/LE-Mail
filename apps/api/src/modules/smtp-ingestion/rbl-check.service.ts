import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'dns';

export interface RblCheckResult {
  isBlocked: boolean;
  rbl?: string;
  response?: string;
  reason?: string;
}

@Injectable()
export class RblCheckService {
  private readonly logger = new Logger(RblCheckService.name);
  private readonly isEnabled: boolean;
  private readonly rblServers: string[];

  constructor(private readonly configService: ConfigService) {
    this.isEnabled =
      this.configService.get<boolean>('smtp.rblEnabled') ?? true;

    const rblConfig =
      this.configService.get<string>('smtp.rblServers') ||
      'zen.spamhaus.org,spamlist.or.kr';
    this.rblServers = rblConfig
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  isPrivateOrLoopbackIp(ip: string): boolean {
    if (!ip) return true;
    const cleanIp = ip.replace(/^::ffff:/, '').trim();

    if (
      cleanIp === '127.0.0.1' ||
      cleanIp === '::1' ||
      cleanIp === 'localhost' ||
      cleanIp === '0.0.0.0'
    ) {
      return true;
    }

    // IPv4 private ranges
    const parts = cleanIp.split('.').map((p) => parseInt(p, 10));
    if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
      if (parts[0] === 10) return true; // 10.0.0.0/8
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
      if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
      if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (link-local)
    }

    return false;
  }

  async checkIp(ip: string): Promise<RblCheckResult> {
    if (!this.isEnabled) {
      return { isBlocked: false };
    }

    const cleanIp = ip.replace(/^::ffff:/, '').trim();
    if (this.isPrivateOrLoopbackIp(cleanIp)) {
      return { isBlocked: false };
    }

    const parts = cleanIp.split('.');
    if (parts.length !== 4) {
      // IPv6 DNSBL checking differs; IPv4 is primary for SMTP spam filtering
      return { isBlocked: false };
    }

    const reversedIp = parts.reverse().join('.');

    for (const rbl of this.rblServers) {
      const queryHost = `${reversedIp}.${rbl}`;
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('RBL lookup timed out')), 1500),
        );

        const addresses = await Promise.race([
          dns.resolve4(queryHost),
          timeoutPromise,
        ]);

        if (addresses && addresses.length > 0) {
          const resp = addresses[0];
          this.logger.warn(
            `[RBL Hit] Client IP ${cleanIp} is listed on ${rbl} (response: ${resp})`,
          );
          return {
            isBlocked: true,
            rbl,
            response: resp,
            reason: `Client IP [${cleanIp}] listed in RBL (${rbl})`,
          };
        }
      } catch (err: any) {
        // ENOTFOUND/ENODATA means not listed in RBL (clean)
        if (err.code !== 'ENOTFOUND' && err.code !== 'ENODATA') {
          this.logger.debug(
            `RBL query for ${queryHost} note: ${err.message}`,
          );
        }
      }
    }

    return { isBlocked: false };
  }
}
