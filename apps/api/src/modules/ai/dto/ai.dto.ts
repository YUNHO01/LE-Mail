import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AiProvider, AiResponseTone } from '@lemail/shared-types';

export class UpdateUserAiSettingsDto {
  @ApiProperty({ description: '개인 AI 기능 활성화 여부' })
  @IsBoolean()
  isEnabled: boolean;

  @ApiProperty({ enum: Object.values(AiProvider), description: '외부 AI 제공자' })
  @IsEnum(AiProvider)
  provider: AiProvider;

  @ApiProperty({ description: '사용할 모델명', example: 'gpt-4o-mini' })
  @IsString()
  @MaxLength(100)
  model: string;

  @ApiPropertyOptional({ description: '새 API Key (변경 시에만 입력)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({ description: '저장된 API Key 삭제 여부' })
  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @ApiPropertyOptional({ description: 'Custom OpenAI 호환 엔드포인트 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customBaseUrl?: string | null;

  @ApiPropertyOptional({ enum: Object.values(AiResponseTone), description: '기본 응답 어조' })
  @IsOptional()
  @IsEnum(AiResponseTone)
  responseTone?: AiResponseTone;

  @ApiPropertyOptional({ description: '기본 응답 언어 코드', example: 'ko' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredLanguage?: string;
}

export class TestAiConnectionDto {
  @ApiProperty({ enum: Object.values(AiProvider), description: '외부 AI 제공자' })
  @IsEnum(AiProvider)
  provider: AiProvider;

  @ApiProperty({ description: '테스트할 모델명', example: 'gpt-4o-mini' })
  @IsString()
  @MaxLength(100)
  model: string;

  @ApiPropertyOptional({ description: 'API Key (미입력 시 저장된 키로 테스트)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Custom OpenAI 호환 엔드포인트 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customBaseUrl?: string | null;
}

export class AiMailSummarizeDto {
  @ApiPropertyOptional({ description: '메일 제목' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @ApiPropertyOptional({ description: '발신자 정보' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sender?: string;

  @ApiPropertyOptional({ description: '메일 HTML 본문' })
  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @ApiPropertyOptional({ description: '메일 텍스트 본문' })
  @IsOptional()
  @IsString()
  bodyText?: string;
}

export class AiMailDraftDto {
  @ApiProperty({
    enum: ['compose', 'reply', 'polish', 'translate'],
    description: '작성 모드 (새 메일 초안, 답장 초안, 문체 다듬기, 번역)',
  })
  @IsIn(['compose', 'reply', 'polish', 'translate'])
  mode: 'compose' | 'reply' | 'polish' | 'translate';

  @ApiPropertyOptional({ description: '사용자 지시사항 또는 키워드' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;

  @ApiPropertyOptional({ description: '메일 제목' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @ApiPropertyOptional({ description: '원본 메일 본문 또는 다듬을 본문' })
  @IsOptional()
  @IsString()
  originalBody?: string;

  @ApiPropertyOptional({ description: '번역/작성 대상 언어', example: 'ko' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  targetLanguage?: string;

  @ApiPropertyOptional({ enum: Object.values(AiResponseTone), description: '응답 어조' })
  @IsOptional()
  @IsEnum(AiResponseTone)
  tone?: AiResponseTone;
}

export class AiContactsParseDto {
  @ApiProperty({ description: '메일 서명 또는 명함 원문 텍스트' })
  @IsString()
  rawText: string;

  @ApiPropertyOptional({ description: '발신자 표시 이름' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  senderName?: string;

  @ApiPropertyOptional({ description: '발신자 이메일 주소' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  senderEmail?: string;
}

export class AiCalendarParseDto {
  @ApiProperty({ description: '자연어 일정 문장 또는 메일 본문 텍스트' })
  @IsString()
  rawText: string;

  @ApiPropertyOptional({ description: '기준 일시 (ISO 8601)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceDate?: string;

  @ApiPropertyOptional({ description: '사용자 타임존', example: 'Asia/Seoul' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;
}

export class AiAnalyzeImageDto {
  @ApiPropertyOptional({ description: 'data:image/...;base64,... 형식의 인라인 이미지' })
  @IsOptional()
  @IsString()
  imageDataUrl?: string;

  @ApiPropertyOptional({ description: '메일 ID (인라인 첨부파일 조회용)' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  mailId?: string;

  @ApiPropertyOptional({ description: '첨부파일 ID (인라인 첨부파일 조회용)' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  attachmentId?: string;

  @ApiPropertyOptional({ description: '명함/서명 연락처 정보 추출 포함 여부' })
  @IsOptional()
  @IsBoolean()
  extractContact?: boolean;

  @ApiPropertyOptional({ description: '추가 해석 지시사항' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;
}
