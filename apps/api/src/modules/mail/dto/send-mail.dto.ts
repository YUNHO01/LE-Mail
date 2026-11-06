import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendMailAttachmentInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: '파일명' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ description: 'MIME 타입' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiProperty({ description: '파일 크기 (bytes)' })
  sizeBytes: number;

  @ApiPropertyOptional({ description: '서버 임시 경로 또는 base64 데이터' })
  @IsOptional()
  @IsString()
  contentBase64?: string;
}

export class SendMailDto {
  @ApiProperty({ description: '받는 사람 이메일 주소 목록', type: [String] })
  @IsArray()
  @IsNotEmpty()
  to: string[];

  @ApiPropertyOptional({ description: '참조(Cc) 이메일 주소 목록', type: [String] })
  @IsOptional()
  @IsArray()
  cc?: string[];

  @ApiPropertyOptional({ description: '숨은참조(Bcc) 이메일 주소 목록', type: [String] })
  @IsOptional()
  @IsArray()
  bcc?: string[];

  @ApiProperty({ description: '메일 제목' })
  @IsString()
  subject: string;

  @ApiPropertyOptional({ description: '메일 본문 (일반 텍스트)' })
  @IsOptional()
  @IsString()
  bodyText?: string;

  @ApiProperty({ description: '메일 본문 (HTML)' })
  @IsString()
  bodyHtml: string;

  @ApiPropertyOptional({ description: '첨부파일 목록', type: [SendMailAttachmentInputDto] })
  @IsOptional()
  @IsArray()
  attachments?: SendMailAttachmentInputDto[];
}
