import { UnauthorizedException } from '@nestjs/common';

import { AdminsService } from 'src/modules/admins/admins.service';
import { Admin } from 'src/modules/admins/entities/admin.entity';
import { AuthService } from 'src/modules/auth/auth.service';

describe('AuthService', () => {
  const admin = { id: 'a1', isActive: true, passwordHash: 'hash' } as Admin;

  const makeService = (overrides: Partial<AdminsService>) =>
    new AuthService({
      findByEmailWithPassword: jest.fn().mockResolvedValue(admin),
      verifyPassword: jest.fn().mockResolvedValue(true),
      ...overrides,
    } as unknown as AdminsService);

  it('비밀번호가 맞으면 어드민을 돌려준다', async () => {
    await expect(makeService({}).validateAdmin('a@b.com', 'pw')).resolves.toBe(admin);
  });

  it('없는 계정이면 401', async () => {
    const service = makeService({ findByEmailWithPassword: jest.fn().mockResolvedValue(null) });
    await expect(service.validateAdmin('a@b.com', 'pw')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('비밀번호가 틀리면 401', async () => {
    const service = makeService({ verifyPassword: jest.fn().mockResolvedValue(false) });
    await expect(service.validateAdmin('a@b.com', 'pw')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('비활성 계정이면 401', async () => {
    const service = makeService({
      findByEmailWithPassword: jest.fn().mockResolvedValue({ ...admin, isActive: false }),
    });
    await expect(service.validateAdmin('a@b.com', 'pw')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
