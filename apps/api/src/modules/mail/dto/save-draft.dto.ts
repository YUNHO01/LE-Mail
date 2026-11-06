import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { SendMailAttachmentInputDto } from './send-mail.dto';

export class SaveDraftDto {
  @ApiPropertyOptional({ description: '기존 임시저장 메일 ID' })
  @IsOptional()
  @IsString()
  draftId?: string;

  @ApiPropertyOptional({ description: '받는 사람 이메일 주소 목록', type: [String] })
  @IsOptional()
  @IsArray()
  to?: string[];

  @ApiPropertyOptional({ description: '참조(Cc) 이메일 주소 목록', type: [String] })
  @IsOptional()
  @IsArray()
  cc?: string[];

  @ApiPropertyOptional({ description: '숨은참조(Bcc) 이메일 주소 목록', type: [String] })
  @IsOptional()
  @IsArray()
  bcc?: string[];

  @ApiPropertyOptional({ description: '메일 제목' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: '메일 본문 (일반 텍스트)' })
  @IsOptional()
  @IsString()
  bodyText?: string;

  @ApiPropertyOptional({ description: '메일 본문 (HTML)' })
  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @ApiPropertyOptional({ description: '첨부파일 목록', type: [SendMailAttachmentInputDto] })
  @IsOptional()
  @IsArray()
  attachments?: SendMailAttachmentInputDto[];
}
