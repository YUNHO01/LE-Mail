import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto, UserDto, UserRole } from '@lemail/shared-types';
import { LicenseService } from '../license/license.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly licenseService: LicenseService,
  ) {}

  async validateUser(email: string, pass: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      return null;
    }

    if (!user.isActive) {
      throw new UnauthorizedException('계정이 비활성화되었습니다. 관리자에게 문의하세요.');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      return null;
    }

    return user;
  }

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    return this.issueLoginResponse(user);
  }

  async issueLoginResponse(user: User): Promise<LoginResponseDto> {

    if (user.role !== UserRole.SYSTEM_ADMIN) {
      const licenseStatus = await this.licenseService.getLicenseStatus();
      if (!licenseStatus.isValid) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'License Required',
          message:
            licenseStatus.message ||
            '유효한 시스템 라이선스가 등록되어 있지 않습니다. 시스템 관리자에게 문의해 주세요.',
          licenseStatus,
        });
      }
    }

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    const userDto: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      mailboxQuotaMb: user.mailboxQuotaMb ?? 512,
      usedBytes: 0,
      usedMb: 0,
      usagePercent: 0,
      messageCount: 0,
      preferredLanguage: user.preferredLanguage || 'ko',
      timezone: user.timezone || 'Asia/Seoul',
      employeeId: user.employeeId || null,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    return {
      accessToken,
      user: userDto,
    };
  }

  async validateForSmtp(username: string, password: string): Promise<boolean> {
    const user = await this.validateUser(username, password);
    return !!user;
  }
}
