import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';

import { AdminsService } from '../admins/admins.service';
import { Admin } from '../admins/entities/admin.entity';

export interface SessionPayload {
  id: string;
  pwdAt: number;
}

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly admins: AdminsService) {
    super();
  }

  serializeUser(admin: Admin, done: (err: Error | null, payload?: SessionPayload) => void): void {
    done(null, { id: admin.id, pwdAt: admin.passwordChangedAt.getTime() });
  }

  async deserializeUser(
    payload: SessionPayload,
    done: (err: Error | null, admin?: Admin | null) => void,
  ): Promise<void> {
    try {
      const admin = await this.admins.findById(payload.id);
      if (!admin || !admin.isActive || admin.passwordChangedAt.getTime() > payload.pwdAt) {
        return done(null, null);
      }
      done(null, admin);
    } catch (err) {
      done(err as Error);
    }
  }
}
