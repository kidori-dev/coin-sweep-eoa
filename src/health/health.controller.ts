import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: '헬스체크', description: 'DB 연결까지 확인한다. (인증 불필요)' })
  @ApiOkResponse({ description: 'ok' })
  @ApiServiceUnavailableResponse({ description: 'DB 등 의존 컴포넌트 비정상' })
  check() {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 1500 })]);
  }
}
