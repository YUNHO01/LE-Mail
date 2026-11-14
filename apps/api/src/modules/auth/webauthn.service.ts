import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { User, UserPasskey } from '../database/entities';
import { AuthService } from './auth.service';
import {
  LoginResponseDto,
  PasskeyCredentialDto,
  WebAuthnLoginOptionsResponseDto,
  WebAuthnRegisterOptionsResponseDto,
} from '@lemail/shared-types';
import {
  base64UrlToBuffer,
  bufferToBase64Url,
  parseAttestationObject,
  sha256,
} from './webauthn.util';

interface PendingChallenge {
  challenge: string;
  purpose: 'register' | 'login';
  rpId: string;
  userId?: string;
  expiresAt: number;
}

@Injectable()
export class WebAuthnService {
  private readonly pendingChallenges = new Map<string, PendingChallenge>();
  private readonly CHALLENGE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @InjectRepository(UserPasskey)
    private readonly passkeyRepository: Repository<UserPasskey>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  private cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [key, entry] of this.pendingChallenges.entries()) {
      if (entry.expiresAt <= now) {
        this.pendingChallenges.delete(key);
      }
    }
  }

  private resolveRpContext(originHeader?: string, hostHeader?: string): {
    rpId: string;
    expectedOrigin: string | null;
  } {
    if (originHeader) {
      try {
        const parsed = new URL(originHeader);
        return {
          rpId: parsed.hostname,
          expectedOrigin: parsed.origin,
        };
      } catch {
        // fall through to hostHeader
      }
    }

    const host = (hostHeader || 'localhost').split(',')[0].trim();
    const hostname = host.split(':')[0] || 'localhost';
    return {
      rpId: hostname,
      expectedOrigin: null,
    };
  }

  private verifyClientData(
    clientDataJSONB64Url: string,
    expectedType: 'webauthn.create' | 'webauthn.get',
    expectedChallenge: string,
    expectedOrigin: string | null,
    rpId: string,
  ): Buffer {
    const clientDataBuf = base64UrlToBuffer(clientDataJSONB64Url);
    let clientData: any;
    try {
      clientData = JSON.parse(clientDataBuf.toString('utf8'));
    } catch {
      throw new BadRequestException('유효하지 않은 clientDataJSON 형식입니다.');
    }

    if (clientData.type !== expectedType) {
      throw new UnauthorizedException('WebAuthn 요청 유형이 일치하지 않습니다.');
    }
    if (clientData.challenge !== expectedChallenge) {
      throw new UnauthorizedException('WebAuthn 챌린지가 유효하지 않거나 만료되었습니다.');
    }

    if (expectedOrigin) {
      if (clientData.origin !== expectedOrigin) {
        throw new UnauthorizedException('WebAuthn Origin 검증에 실패했습니다.');
      }
    } else if (clientData.origin) {
      try {
        const originUrl = new URL(clientData.origin);
        if (originUrl.hostname !== rpId) {
          throw new UnauthorizedException('WebAuthn 도메인 검증에 실패했습니다.');
        }
      } catch {
        throw new UnauthorizedException('유효하지 않은 WebAuthn Origin입니다.');
      }
    }

    return clientDataBuf;
  }

  async getRegisterOptions(
    userId: string,
    originHeader?: string,
    hostHeader?: string,
  ): Promise<WebAuthnRegisterOptionsResponseDto> {
    this.cleanupExpiredChallenges();
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('유효하지 않은 사용자입니다.');
    }

    const { rpId } = this.resolveRpContext(originHeader, hostHeader);
    const challenge = bufferToBase64Url(crypto.randomBytes(32));

    this.pendingChallenges.set(`reg:${userId}`, {
      challenge,
      purpose: 'register',
      rpId,
      userId,
      expiresAt: Date.now() + this.CHALLENGE_TTL_MS,
    });

    const existing = await this.passkeyRepository.find({
      where: { userId },
      select: { credentialId: true },
    });

    return {
      challenge,
      rp: {
        name: 'LEMail',
        id: rpId,
      },
      user: {
        id: bufferToBase64Url(Buffer.from(user.id, 'utf8')),
        name: user.email,
        displayName: user.name || user.email,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      excludeCredentials: existing.map((item) => ({
        id: item.credentialId,
        type: 'public-key',
      })),
    };
  }

  async verifyRegister(
    userId: string,
    body: {
      id: string;
      rawId?: string;
      response: {
        clientDataJSON: string;
        attestationObject: string;
        transports?: string[];
      };
      deviceName?: string;
    },
    originHeader?: string,
    hostHeader?: string,
  ): Promise<PasskeyCredentialDto> {
    const pendingKey = `reg:${userId}`;
    const pending = this.pendingChallenges.get(pendingKey);
    this.pendingChallenges.delete(pendingKey);

    if (!pending || pending.purpose !== 'register' || pending.expiresAt <= Date.now()) {
      throw new UnauthorizedException('생체인식 등록 세션이 만료되었습니다. 다시 시도해 주세요.');
    }

    const { expectedOrigin } = this.resolveRpContext(originHeader, hostHeader);
    this.verifyClientData(
      body.response.clientDataJSON,
      'webauthn.create',
      pending.challenge,
      expectedOrigin,
      pending.rpId,
    );

    let parsed;
    try {
      parsed = parseAttestationObject(body.response.attestationObject);
    } catch (err: any) {
      throw new BadRequestException(err?.message || '생체인식 공개키 파싱에 실패했습니다.');
    }

    const expectedRpIdHash = sha256(pending.rpId);
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      throw new UnauthorizedException('RP ID 검증에 실패했습니다.');
    }

    const userPresent = Boolean(parsed.flags & 0x01);
    const userVerified = Boolean(parsed.flags & 0x04);
    if (!userPresent || !userVerified) {
      throw new UnauthorizedException('사용자 생체 인증 확인(UV)에 실패했습니다.');
    }

    const duplicate = await this.passkeyRepository.findOne({
      where: { credentialId: parsed.credentialId },
    });
    if (duplicate) {
      throw new BadRequestException('이미 등록된 생체인식 자격증명입니다.');
    }

    const entity = this.passkeyRepository.create({
      userId,
      credentialId: parsed.credentialId,
      publicKeyPem: parsed.publicKeyPem,
      algorithm: parsed.algorithm,
      counter: parsed.signCount,
      transports: Array.isArray(body.response.transports)
        ? body.response.transports.join(',')
        : null,
      deviceName: (body.deviceName || '모바일 기기').trim().slice(0, 120),
      lastUsedAt: null,
    });

    const saved = await this.passkeyRepository.save(entity);
    return {
      id: saved.id,
      credentialId: saved.credentialId,
      deviceName: saved.deviceName,
      lastUsedAt: saved.lastUsedAt ? saved.lastUsedAt.toISOString() : null,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async listCredentials(userId: string): Promise<PasskeyCredentialDto[]> {
    const rows = await this.passkeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      credentialId: row.credentialId,
      deviceName: row.deviceName,
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async deleteCredential(userId: string, credentialRowId: string): Promise<{ deleted: boolean }> {
    const existing = await this.passkeyRepository.findOne({
      where: { id: credentialRowId, userId },
    });
    if (!existing) {
      throw new NotFoundException('등록된 생체인식 정보를 찾을 수 없습니다.');
    }
    await this.passkeyRepository.remove(existing);
    return { deleted: true };
  }

  async getLoginOptions(
    email?: string,
    originHeader?: string,
    hostHeader?: string,
  ): Promise<WebAuthnLoginOptionsResponseDto> {
    this.cleanupExpiredChallenges();
    const { rpId } = this.resolveRpContext(originHeader, hostHeader);
    const challenge = bufferToBase64Url(crypto.randomBytes(32));

    let allowCredentials: WebAuthnLoginOptionsResponseDto['allowCredentials'] = [];
    if (email && email.trim()) {
      const user = await this.userRepository.findOne({ where: { email: email.trim() } });
      if (user) {
        const creds = await this.passkeyRepository.find({
          where: { userId: user.id },
        });
        allowCredentials = creds.map((c) => ({
          id: c.credentialId,
          type: 'public-key',
          transports: c.transports ? c.transports.split(',').filter(Boolean) : undefined,
        }));
      }
    }

    this.pendingChallenges.set(`login:${challenge}`, {
      challenge,
      purpose: 'login',
      rpId,
      expiresAt: Date.now() + this.CHALLENGE_TTL_MS,
    });

    const challengeToken = this.jwtService.sign(
      { purpose: 'webauthn_login', challenge, rpId },
      { expiresIn: '5m' },
    );

    return {
      challengeToken,
      challenge,
      rpId,
      timeout: 60000,
      userVerification: 'required',
      allowCredentials,
    };
  }

  async verifyLogin(
    body: {
      challengeToken: string;
      id: string;
      rawId?: string;
      response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
        userHandle?: string | null;
      };
    },
    originHeader?: string,
    hostHeader?: string,
  ): Promise<LoginResponseDto> {
    let tokenPayload: any;
    try {
      tokenPayload = this.jwtService.verify(body.challengeToken);
    } catch {
      throw new UnauthorizedException('생체인식 로그인 세션이 만료되었습니다. 다시 시도해 주세요.');
    }

    if (tokenPayload?.purpose !== 'webauthn_login' || !tokenPayload?.challenge) {
      throw new UnauthorizedException('유효하지 않은 생체인식 챌린지입니다.');
    }

    const pendingKey = `login:${tokenPayload.challenge}`;
    const pending = this.pendingChallenges.get(pendingKey);
    this.pendingChallenges.delete(pendingKey);

    if (!pending || pending.expiresAt <= Date.now()) {
      throw new UnauthorizedException('생체인식 로그인 챌린지가 만료되었습니다.');
    }

    const { expectedOrigin } = this.resolveRpContext(originHeader, hostHeader);
    const clientDataBuf = this.verifyClientData(
      body.response.clientDataJSON,
      'webauthn.get',
      pending.challenge,
      expectedOrigin,
      pending.rpId,
    );

    const passkey = await this.passkeyRepository.findOne({
      where: { credentialId: body.id },
      relations: { user: true },
    });
    if (!passkey || !passkey.user) {
      throw new UnauthorizedException('등록된 생체인식 정보를 찾을 수 없습니다.');
    }
    if (!passkey.user.isActive) {
      throw new UnauthorizedException('계정이 비활성화되었습니다. 관리자에게 문의하세요.');
    }

    const authData = base64UrlToBuffer(body.response.authenticatorData);
    if (authData.length < 37) {
      throw new BadRequestException('유효하지 않은 authenticatorData입니다.');
    }

    const rpIdHash = authData.subarray(0, 32);
    if (!rpIdHash.equals(sha256(pending.rpId))) {
      throw new UnauthorizedException('RP ID 검증에 실패했습니다.');
    }

    const flags = authData.readUInt8(32);
    const userPresent = Boolean(flags & 0x01);
    const userVerified = Boolean(flags & 0x04);
    if (!userPresent || !userVerified) {
      throw new UnauthorizedException('생체 인증 확인(UV)에 실패했습니다.');
    }

    const signCount = authData.readUInt32BE(33);
    if ((passkey.counter > 0 || signCount > 0) && signCount <= passkey.counter) {
      throw new UnauthorizedException('보안 카운터 검증에 실패했습니다. 다시 등록해 주세요.');
    }

    const signedData = Buffer.concat([authData, sha256(clientDataBuf)]);
    const signatureBuf = base64UrlToBuffer(body.response.signature);

    const isValid = crypto
      .createVerify('SHA256')
      .update(signedData)
      .verify(passkey.publicKeyPem, signatureBuf);

    if (!isValid) {
      throw new UnauthorizedException('생체인식 서명 검증에 실패했습니다.');
    }

    passkey.counter = signCount;
    passkey.lastUsedAt = new Date();
    await this.passkeyRepository.save(passkey);

    return this.authService.issueLoginResponse(passkey.user);
  }
}
