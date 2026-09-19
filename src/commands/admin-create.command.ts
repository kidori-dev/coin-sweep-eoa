import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { AdminsService } from '../modules/admins/admins.service';
import { AdminRole } from '../modules/admins/entities/admin.entity';

interface AdminCreateOptions {
  email: string;
  password: string;
  name?: string;
  role: AdminRole;
}

@Command({
  name: 'admin:create',
  description:
    '어드민 계정을 생성한다. 예) npm run cli -- admin:create -e a@b.com -p secret1234 -r super_admin',
})
export class AdminCreateCommand extends CommandRunner {
  private readonly logger = new Logger(AdminCreateCommand.name);

  constructor(private readonly admins: AdminsService) {
    super();
  }

  async run(_params: string[], options: AdminCreateOptions): Promise<void> {
    const admin = await this.admins.create({
      email: options.email,
      password: options.password,
      name: options.name ?? null,
      role: options.role,
    });

    this.logger.log(`created admin ${admin.email} (${admin.id}) role=${admin.role}`);
  }

  @Option({ flags: '-e, --email <email>', description: '이메일', required: true })
  parseEmail(value: string): string {
    return value;
  }

  @Option({ flags: '-p, --password <password>', description: '비밀번호(8자 이상)', required: true })
  parsePassword(value: string): string {
    if (value.length < 8) {
      throw new Error('비밀번호는 8자 이상이어야 합니다.');
    }
    return value;
  }

  @Option({ flags: '-n, --name <name>', description: '표시 이름' })
  parseName(value: string): string {
    return value;
  }

  @Option({
    flags: '-r, --role <role>',
    description: `권한 (${Object.values(AdminRole).join('|')})`,
  })
  parseRole(value: string): AdminRole {
    const role = value as AdminRole;
    if (!Object.values(AdminRole).includes(role)) {
      throw new Error(`알 수 없는 role: ${value}`);
    }
    return role;
  }
}
