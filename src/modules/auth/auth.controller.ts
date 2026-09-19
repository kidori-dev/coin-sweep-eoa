import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';
import { SESSION_AUTH } from '../../swagger.setup';
import { AdminsService } from '../admins/admins.service';
import { Admin } from '../admins/entities/admin.entity';
import { AdminProfileResponseDto } from './dto/admin-profile.response.dto';
import { LoginRequestDto } from './dto/login.request.dto';

@ApiTags('auth')
@ApiCookieAuth(SESSION_AUTH)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly admins: AdminsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '어드민 로그인', description: '성공하면 세션 쿠키를 내려준다.' })
  @ApiOkResponse({ type: AdminProfileResponseDto })
  @ApiUnauthorizedResponse({ description: '이메일 또는 비밀번호가 올바르지 않음' })
  async login(
    @Body() _dto: LoginRequestDto,
    @Req() req: Request,
    @CurrentAdmin() admin: Admin,
  ): Promise<AdminProfileResponseDto> {
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => {
        if (err) {
          return reject(err);
        }
        req.logIn(admin, (loginErr) => {
          if (loginErr) {
            return reject(loginErr);
          }
          req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
        });
      }),
    );

    await this.admins.touchLastLogin(admin.id);

    return AdminProfileResponseDto.from(admin);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '로그아웃', description: '세션을 파기한다.' })
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      req.logOut({ keepSessionInfo: false }, (err) => (err ? reject(err) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );

    res.clearCookie(this.config.get<string>('session.name') ?? 'sid', {
      httpOnly: true,
      sameSite: this.config.get<'lax' | 'strict' | 'none'>('session.sameSite'),
      secure: this.config.get<boolean>('session.secure'),
    });
  }

  @Get('me')
  @ApiOperation({ summary: '내 어드민 정보' })
  @ApiOkResponse({ type: AdminProfileResponseDto })
  @ApiUnauthorizedResponse({ description: '로그인이 필요함' })
  me(@CurrentAdmin() admin: Admin): AdminProfileResponseDto {
    return AdminProfileResponseDto.from(admin);
  }
}
