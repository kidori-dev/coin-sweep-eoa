import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { ScanScope } from '../entities/scan-cursor.entity';
import { ScanRunStatus, ScanTrigger } from '../entities/scan-run.entity';

export class ScanCursorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ScanScope })
  scope!: ScanScope;

  @ApiProperty({ nullable: true, type: String, description: 'null 이면 전역 커서' })
  userWalletId!: string | null;

  @ApiProperty({ nullable: true, type: String, description: '입금주소. 전역 커서면 null' })
  address!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'null 이면 네이티브 TRX' })
  contract!: string | null;

  @ApiProperty({ format: 'date-time', description: '이 시각까지는 빠짐없이 조회 완료' })
  scannedThroughAt!: Date;

  @ApiProperty({ nullable: true, type: String })
  lastSeenTxid!: string | null;

  @ApiProperty({ description: '조회 limit 에 걸려 잘렸다. 다음 스캔이 이어받는다' })
  truncated!: boolean;

  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  lastRunAt!: Date | null;

  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  lastSuccessAt!: Date | null;

  @ApiProperty({ nullable: true, type: String })
  lastError!: string | null;
}

export class RewindCursorRequestDto {
  @ApiPropertyOptional({
    enum: ScanScope,
    default: ScanScope.DEPOSIT,
    description: '되감을 스코프',
  })
  @IsOptional()
  @IsEnum(ScanScope)
  scope?: ScanScope;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-01T00:00:00.000Z',
    description: '이 시각부터 다시 조회한다',
  })
  @Type(() => Date)
  @IsDate()
  to!: Date;

  @ApiPropertyOptional({
    description: '특정 입금주소만 되감는다. 없으면 스코프 전체',
    example: 'TGvDeLTv2t5ExSr4feakLjDCjbRDKAnrKz',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  address?: string;

  @ApiPropertyOptional({
    description: '특정 컨트랙트만 되감는다. 없으면 컨트랙트 무관 전체',
    example: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contract?: string;
}

export class RewindCursorResponseDto {
  @ApiProperty({ description: '되감긴 커서 수' })
  affected!: number;

  @ApiProperty({ format: 'date-time' })
  to!: Date;
}

export class ScanRunResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ScanScope })
  scope!: ScanScope;

  @ApiProperty({ enum: ScanRunStatus })
  status!: ScanRunStatus;

  @ApiProperty({ enum: ScanTrigger })
  trigger!: ScanTrigger;

  @ApiProperty()
  dryRun!: boolean;

  @ApiProperty({ nullable: true, type: String })
  contract!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  windowFrom!: Date | null;

  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  windowTo!: Date | null;

  @ApiProperty()
  walletsScanned!: number;

  @ApiProperty()
  found!: number;

  @ApiProperty()
  applied!: number;

  @ApiProperty({ description: '확정 지연 버퍼에 걸려 다음 실행으로 미룬 건수' })
  pending!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty({ nullable: true, type: String })
  error!: string | null;

  @ApiProperty({ format: 'date-time' })
  startedAt!: Date;

  @ApiProperty({ nullable: true, format: 'date-time', type: String })
  finishedAt!: Date | null;
}

export class FindScanRunsQueryDto {
  @ApiPropertyOptional({ enum: ScanScope })
  @IsOptional()
  @IsEnum(ScanScope)
  scope?: ScanScope;

  @ApiPropertyOptional({ enum: ScanRunStatus })
  @IsOptional()
  @IsEnum(ScanRunStatus)
  status?: ScanRunStatus;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class FindScanCursorsQueryDto {
  @ApiPropertyOptional({ enum: ScanScope })
  @IsOptional()
  @IsEnum(ScanScope)
  scope?: ScanScope;
}
