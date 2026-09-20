import { ConflictException, Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';

import { AdminsService } from '../modules/admins/admins.service';
import { AdminRole } from '../modules/admins/entities/admin.entity';
import { ContractsService } from '../modules/contracts/contracts.service';

@Command({
  name: 'db:seed',
  description: '초기 데이터를 넣는다. (최초 super_admin 계정, 네이티브 TRX 행)',
})
export class DbSeedCommand extends CommandRunner {
  private readonly logger = new Logger(DbSeedCommand.name);

  constructor(
    private readonly admins: AdminsService,
    private readonly contracts: ContractsService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.seedAdmin();

    // TRX 행은 집금 이력의 FK 대상이라 미리 있어야 한다. 입금 스캔 대상은 아니다.
    const native = await this.contracts.ensureNative();
    this.logger.log(`native ${native.symbol} (decimals ${native.decimals}) 준비됨`);

    // 감시할 토큰은 tron:contract-add 로만 등록한다. 등록 경로를 하나로 두어야
    // "env 를 바꿨는데 왜 안 바뀌지" 같은 어긋남이 생기지 않는다.
    this.logger.log(
      '감시할 TRC20 은 `npm run cli -- tron:contract-add -c <컨트랙트 주소> -m <최소 집금액>` ' +
        '으로 등록하세요.',
    );
  }

  private async seedAdmin(): Promise<void> {
    const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin1234';

    try {
      const admin = await this.admins.create({
        email,
        password,
        name: 'Super Admin',
        role: AdminRole.SUPER_ADMIN,
      });
      this.logger.log(`seeded super admin ${admin.email}`);
    } catch (err) {
      if (err instanceof ConflictException) {
        this.logger.log(`admin ${email} 이(가) 이미 있어 건너뜀`);
        return;
      }
      throw err;
    }
  }
}
