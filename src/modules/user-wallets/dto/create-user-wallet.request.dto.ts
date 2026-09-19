import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUserWalletRequestDto {
  @ApiPropertyOptional({
    example: 'user-1024',
    description: '서비스 쪽 사용자 식별자. 나중에 입금 매칭에 쓴다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  userRef?: string;
}
