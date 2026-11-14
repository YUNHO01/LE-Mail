import { Body, Controller, Delete, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { WebAuthnService } from './webauthn.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly webAuthnService: WebAuthnService,
  ) {}

  @Post('login')
  @ApiOperation({
    summary: '사용자 및 관리자 로그인',
    description: '이메일과 비밀번호로 로그인하여 JWT 액세스 토큰을 발급받습니다.',
  })
  @ApiResponse({ status: 200, description: '로그인 성공' })
  @ApiResponse({ status: 401, description: '인증 실패 (이메일/비밀번호 불일치)' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
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
    @Headers('origin') origin?: string,
    @Headers('x-forwarded-host') forwardedHost?: string,
    @Headers('host') host?: string,
  ) {
    return this.webAuthnService.verifyLogin(body, origin, forwardedHost || host);
  }
}
