import { Injectable, UnauthorizedException } from '@nestjs/common';

import { Admin } from '../admins/entities/admin.entity';
import { AdminsService } from '../admins/admins.service';

@Injectable()
export class AuthService {
  constructor(private readonly admins: AdminsService) {}

  async validateAdmin(email: string, password: string): Promise<Admin> {
    const admin = await this.admins.findByEmailWithPassword(email);
    if (!admin || !(await this.admins.verifyPassword(password, admin.passwordHash))) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    if (!admin.isActive) {
      throw new UnauthorizedException('비활성화된 어드민 계정입니다.');
    }
    return admin;
  }
}
