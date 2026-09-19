import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';

import { Admin, AdminRole } from './entities/admin.entity';

export interface CreateAdminInput {
  email: string;
  password: string;
  name?: string | null;
  role?: AdminRole;
}

@Injectable()
export class AdminsService {
  private static readonly SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(Admin)
    private readonly admins: Repository<Admin>,
  ) {}

  async create(input: CreateAdminInput): Promise<Admin> {
    const email = input.email.trim().toLowerCase();
    if (await this.admins.exists({ where: { email } })) {
      throw new ConflictException(`이미 존재하는 어드민 이메일입니다: ${email}`);
    }

    const admin = this.admins.create({
      email,
      passwordHash: await this.hashPassword(input.password),
      name: input.name ?? null,
      role: input.role ?? AdminRole.ADMIN,
    });

    return this.admins.save(admin);
  }

  findById(id: string): Promise<Admin | null> {
    return this.admins.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<Admin> {
    const admin = await this.findById(id);
    if (!admin) {
      throw new NotFoundException(`어드민을 찾을 수 없습니다: ${id}`);
    }
    return admin;
  }

  findByEmailWithPassword(email: string): Promise<Admin | null> {
    return this.admins.findOne({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        name: true,
        passwordChangedAt: true,
      },
    });
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async changePassword(id: string, newPassword: string): Promise<void> {
    await this.findByIdOrFail(id);
    await this.admins.update(id, {
      passwordHash: await this.hashPassword(newPassword),
      passwordChangedAt: new Date(),
    });
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.admins.update(id, { lastLoginAt: new Date() });
  }

  private hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, AdminsService.SALT_ROUNDS);
  }
}
