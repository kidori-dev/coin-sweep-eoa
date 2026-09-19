import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { AdminsService } from '../modules/admins/admins.service';

interface AdminPasswordOptions {
  password: string;
}

@Command({
  name: 'admin:password',
  arguments: '<adminId>',
  description: '어드민 비밀번호를 재설정한다. 예) npm run cli -- admin:password <id> -p newpass123',
})
export class AdminPasswordCommand extends CommandRunner {
  private readonly logger = new Logger(AdminPasswordCommand.name);

  constructor(private readonly admins: AdminsService) {
    super();
  }

  async run([adminId]: string[], options: AdminPasswordOptions): Promise<void> {
    await this.admins.changePassword(adminId, options.password);
    this.logger.log(`password updated for admin ${adminId}`);
  }

  @Option({
    flags: '-p, --password <password>',
    description: '새 비밀번호(8자 이상)',
    required: true,
  })
  parsePassword(value: string): string {
    if (value.length < 8) {
      throw new Error('비밀번호는 8자 이상이어야 합니다.');
    }
    return value;
  }
}
