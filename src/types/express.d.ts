import { Admin } from '../modules/admins/entities/admin.entity';
import { SessionPayload } from '../modules/auth/session.serializer';

declare global {
  namespace Express {
    interface User extends Admin {}
  }
}

declare module 'express-session' {
  interface SessionData {
    passport?: { user: SessionPayload };
  }
}

export {};
