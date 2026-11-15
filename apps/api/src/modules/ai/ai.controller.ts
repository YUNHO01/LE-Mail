import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiService } from './ai.service';
import {
  AiAnalyzeImageDto,
  AiCalendarParseDto,
  AiContactsParseDto,
  AiMailDraftDto,
  AiMailSummarizeDto,
  TestAiConnectionDto,
  UpdateUserAiSettingsDto,
} from './dto/ai.dto';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('policy')
  @ApiOperation({
    summary: '관리자 개인용 외부 AI 허용 정책 조회',
    description: '현재 로그인한 사용자가 개인 외부 AI 및 이미지 해석 기능을 사용할 수 있는지 정책을 조회합니다.',
  })
  @ApiResponse({ status: 200, description: 'AI 정책 조회 성공' })
  getPolicy() {
    return this.aiService.getPolicy();
  }

  @Get('settings')
  @ApiOperation({
    summary: '내 개인 AI 설정 조회 (API Key 마스킹)',
    description: '현재 로그인한 사용자의 외부 AI 제공자, 모델, 활성화 여부 및 마스킹된 API Key 정보를 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '사용자 AI 설정 조회 성공' })
  getMySettings(@CurrentUser() user: any) {
    return this.aiService.getUserSettings(user.id);
  }

  @Put('settings')
  @ApiOperation({
    summary: '내 개인 AI 설정 저장 (API Key AES-256-GCM 암호화)',
    description: '사용자의 외부 AI 설정을 저장하며, 입력된 API Key는 AES-256-GCM으로 암호화하여 보관합니다.',
  })
  @ApiResponse({ status: 200, description: '사용자 AI 설정 저장 성공' })
  updateMySettings(
    @CurrentUser() user: any,
    @Body() dto: UpdateUserAiSettingsDto,
  ) {
    return this.aiService.updateUserSettings(user.id, dto);
  }

  @Post('settings/test')
  @ApiOperation({
    summary: '외부 AI 연결 사전 테스트',
    description: '입력된 또는 저장된 API Key와 모델로 외부 AI 응답 여부를 테스트합니다.',
  })
  @ApiResponse({ status: 200, description: '연결 테스트 결과 반환' })
  testConnection(
    @CurrentUser() user: any,
    @Body() dto: TestAiConnectionDto,
  ) {
    return this.aiService.testConnection(user.id, dto);
  }

  @Post('mail/summarize')
  @ApiOperation({
    summary: '메일 본문 AI 요약 및 할 일 추출',
    description: '메일 본문을 요약하고 핵심 액션 아이템 및 주요 일정을 추출합니다.',
  })
  summarizeMail(
    @CurrentUser() user: any,
    @Body() dto: AiMailSummarizeDto,
  ) {
    return this.aiService.summarizeMail(user.id, dto);
  }

  @Post('mail/draft')
  @ApiOperation({
    summary: '메일 AI 초안 작성 / 답장 / 다듬기 / 번역',
    description: '키워드 또는 원본 메일을 바탕으로 메일 초안을 생성하거나 문체를 다듬고 번역합니다.',
  })
  draftMail(
    @CurrentUser() user: any,
    @Body() dto: AiMailDraftDto,
  ) {
    return this.aiService.draftMail(user.id, dto);
  }

  @Post('mail/analyze-image')
  @ApiOperation({
    summary: '메일 본문 인라인 이미지 AI 해석 및 OCR',
    description: '메일 본문 내 인라인 이미지(cid 또는 data:image)를 해석하고 텍스트 및 명함 연락처를 추출합니다.',
  })
  analyzeImage(
    @CurrentUser() user: any,
    @Body() dto: AiAnalyzeImageDto,
  ) {
    return this.aiService.analyzeImage(user.id, dto);
  }

  @Post('contacts/parse')
  @ApiOperation({
    summary: '메일 서명 / 명함 텍스트에서 연락처 정보 AI 추출',
    description: '메일 본문 서명이나 명함 텍스트에서 이름, 회사, 직책, 연락처 정보를 구조화하여 추출합니다.',
  })
  parseContact(
    @CurrentUser() user: any,
    @Body() dto: AiContactsParseDto,
  ) {
    return this.aiService.parseContact(user.id, dto);
  }

  @Post('calendar/parse')
  @ApiOperation({
    summary: '자연어 문장 또는 메일 본문에서 일정 정보 AI 추출',
    description: '자연어 일정 입력 또는 메일 본문에서 제목, 시작/종료 일시, 장소 정보를 구조화하여 추출합니다.',
  })
  parseCalendarEvent(
    @CurrentUser() user: any,
    @Body() dto: AiCalendarParseDto,
  ) {
    return this.aiService.parseCalendarEvent(user.id, dto);
  }
}
