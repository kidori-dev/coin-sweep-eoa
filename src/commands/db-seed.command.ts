import { ConflictException, Logger } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';

import { AdminsService } from '../modules/admins/admins.service';
import { AdminRole } from '../modules/admins/entities/admin.entity';

@Command({
  name: 'db:seed',
  description: '초기 데이터를 넣는다. (최초 super_admin 계정)',
})
export class DbSeedCommand extends CommandRunner {
  private readonly logger = new Logger(DbSeedCommand.name);

  constructor(private readonly admins: AdminsService) {
    super();
  }

  async run(): Promise<void> {
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
