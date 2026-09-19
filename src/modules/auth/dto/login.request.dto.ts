import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'admin1234', minLength: 8, format: 'password' })
  @IsString()
  @MinLength(8)
  password!: string;
}
