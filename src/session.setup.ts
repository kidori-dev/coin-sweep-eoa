import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import createMemoryStore from 'memorystore';
import passport from 'passport';

export function setupSession(app: INestApplication): void {
  const config = app.get(ConfigService);
  const MemoryStore = createMemoryStore(session);
  const maxAge = config.get<number>('session.maxAge')!;

  app.use(
    session({
      store: new MemoryStore({
        ttl: maxAge,
        checkPeriod: config.get<number>('session.pruneInterval'),
      }),
      name: config.get<string>('session.name'),
      secret: config.get<string>('session.secret')!,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: config.get<'lax' | 'strict' | 'none'>('session.sameSite'),
        secure: config.get<boolean>('session.secure'),
        maxAge,
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());
}
