import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { RankPresetType } from '@lemail/shared-types';

export class CreateOrgRankDto {
  @ApiProperty({ example: 10, description: '레벨(서열, 오름차순 정렬 기준)' })
  @IsInt()
  @Min(0)
  level!: number;

  @ApiProperty({ example: '과장', description: '직위명' })
  @IsString()
  @IsNotEmpty({ message: '직위명을 입력해 주세요.' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'GEN_40', description: '직위코드 (유니크)' })
  @IsString()
  @IsNotEmpty({ message: '직위코드를 입력해 주세요.' })
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: '일반기업 중간 관리자', required: false, description: '설명' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string | null;
}

export class UpdateOrgRankDto {
  @ApiProperty({ example: 10, required: false, description: '레벨(서열)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  level?: number;

  @ApiProperty({ example: '과장', required: false, description: '직위명' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 'GEN_40', required: false, description: '직위코드' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ example: '설명', required: false, description: '설명' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string | null;
}

export class ApplyRankPresetDto {
  @ApiProperty({
    enum: ['GENERAL', 'PUBLIC_RESEARCH', 'MANUFACTURING'],
    example: 'GENERAL',
    description: '직급 업종 템플릿 (GENERAL: 일반기업, PUBLIC_RESEARCH: 공공연구, MANUFACTURING: 제조생산)',
  })
  @IsIn(['GENERAL', 'PUBLIC_RESEARCH', 'MANUFACTURING'])
  preset!: RankPresetType;
}

export class CreateOrgTitleDto {
  @ApiProperty({ example: 10, description: '순서(서열, 오름차순 정렬 기준)' })
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @ApiProperty({ example: '팀장', description: '직책명' })
  @IsString()
  @IsNotEmpty({ message: '직책명을 입력해 주세요.' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '팀 단위 업무 총괄', required: false, description: '설명' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string | null;
}

export class UpdateOrgTitleDto {
  @ApiProperty({ example: 10, required: false, description: '순서(서열)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ example: '팀장', required: false, description: '직책명' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: '팀 단위 업무 총괄', required: false, description: '설명' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string | null;
}

export class BulkDeleteIdsDto {
  @ApiProperty({ type: [String], description: '삭제할 ID 목록' })
  @IsArray()
  @ArrayNotEmpty({ message: '삭제할 항목을 선택해 주세요.' })
  @IsString({ each: true })
  ids!: string[];
}
