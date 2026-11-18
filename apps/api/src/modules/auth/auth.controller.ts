import { Body, Controller, Delete, Get, Headers, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ApiKeyService } from './api-key.service';
import { WebAuthnService } from './webauthn.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

const AUTH_COOKIE_NAME = 'lemail_token';

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

function setAuthCookie(req: Request, res: Response, accessToken?: string) {
  if (!accessToken) return;
  res.cookie(AUTH_COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly apiKeyService: ApiKeyService,
    private readonly webAuthnService: WebAuthnService,
  ) {}

  @Post('exchange-api-key')
  @ApiOperation({
    summary: 'API Key를 JWT 액세스 토큰으로 교환',
    description: 'MCP 클라이언트 등 외부 연동 시 개인 API Key로 단기 JWT 토큰과 허용 스코프를 발급받습니다.',
  })
  @ApiResponse({ status: 200, description: '교환 성공' })
  @ApiResponse({ status: 401, description: '유효하지 않거나 만료된 API Key' })
  async exchangeApiKey(
    @Body() body: { apiKey?: string },
    @Headers('x-api-key') headerApiKey?: string,
  ) {
    return this.apiKeyService.exchangeApiKey(body?.apiKey || headerApiKey || '');
  }

  @Post('login')
  @ApiOperation({
    summary: '사용자 및 관리자 로그인',
    description: '이메일과 비밀번호로 로그인하여 HttpOnly 쿠키 및 JWT 액세스 토큰을 발급합니다.',
  })
  @ApiResponse({ status: 200, description: '로그인 성공' })
  @ApiResponse({ status: 401, description: '인증 실패 (이메일/비밀번호 불일치)' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    setAuthCookie(req, res, result?.accessToken);
    return result;
  }

  @Post('logout')
  @ApiOperation({
    summary: '로그아웃',
    description: 'HttpOnly 인증 쿠키를 만료시킵니다.',
  })
  @ApiResponse({ status: 200, description: '로그아웃 성공' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttpsRequest(req),
      path: '/',
    });
    return { success: true };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '현재 로그인 사용자 프로필 조회',
    description: 'JWT 토큰을 통해 현재 접속 중인 사용자의 기본 정보를 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '조회 성공' })
  @ApiResponse({ status: 401, description: '인증 만료 또는 유효하지 않음' })
  async getProfile(@CurrentUser() user: any) {
    return user;
  }

  @Post('webauthn/register/options')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '생체인식(WebAuthn) 등록 옵션 발급' })
  async getWebAuthnRegisterOptions(
    @CurrentUser() user: any,
    @Headers('origin') origin?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ) {
    return this.webAuthnService.getRegisterOptions(user.id, origin, forwardedHost || host);
  }

  @Post('webauthn/register/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '생체인식(WebAuthn) 자격증명 등록 검증 및 저장' })
  async verifyWebAuthnRegister(
    @CurrentUser() user: any,
    @Body() body: any,
    @Headers('origin') origin?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ) {
    return this.webAuthnService.verifyRegister(user.id, body, origin, forwardedHost || host);
  }

  @Get('webauthn/credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '등록된 생체인식 자격증명 목록 조회' })
  async listWebAuthnCredentials(@CurrentUser() user: any) {
    return this.webAuthnService.listCredentials(user.id);
  }

  @Delete('webauthn/credentials/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '등록된 생체인식 자격증명 삭제' })
  async deleteWebAuthnCredential(@CurrentUser() user: any, @Param('id') id: string) {
    return this.webAuthnService.deleteCredential(user.id, id);
  }

  @Post('webauthn/login/options')
  @ApiOperation({ summary: '생체인식(WebAuthn) 로그인 챌린지 옵션 발급' })
  async getWebAuthnLoginOptions(
    @Body() body: { email?: string },
    @Headers('origin') origin?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ) {
    return this.webAuthnService.getLoginOptions(body?.email, origin, forwardedHost || host);
  }

  @Post('webauthn/login/verify')
  @ApiOperation({ summary: '생체인식(WebAuthn) 로그인 서명 검증 및 JWT 발급' })
  async verifyWebAuthnLogin(
    @Body() body: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') origin?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ) {
    const result = await this.webAuthnService.verifyLogin(body, origin, forwardedHost || host);
    setAuthCookie(req, res, result?.accessToken);
    return result;
  }
}
