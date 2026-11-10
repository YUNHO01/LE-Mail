import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseService } from '../license.service';
import { SKIP_LICENSE_CHECK_KEY } from '../decorators/skip-license-check.decorator';

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly licenseService: LicenseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_LICENSE_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const path: string = request.path || request.url || '';

    // 예외 허용 경로 (로그인, 인증, 라이선스 조회 및 등록, 문서, 헬스체크)
    if (
      path.startsWith('/api/v1/auth') ||
      path.startsWith('/api/auth') ||
      path.startsWith('/api/v1/admin/license') ||
      path.startsWith('/api/admin/license') ||
      path.startsWith('/docs') ||
      path.startsWith('/api/health') ||
      path.startsWith('/health')
    ) {
      return true;
    }

    const status = await this.licenseService.getLicenseStatus();
    if (!status.isValid) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'License Required',
        message: status.message || '시스템 정품 라이선스가 유효하지 않거나 만료되었습니다.',
        licenseStatus: status,
      });
    }

    return true;
  }
}
