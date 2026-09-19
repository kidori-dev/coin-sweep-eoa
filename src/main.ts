import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { setupSession } from './session.setup';
import { setupSwagger } from './swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.set('trust proxy', config.get<number>('trustProxy') ?? 0);

  const corsOrigins = config.get<string[]>('cors.origins') ?? [];
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept'],
      maxAge: 86400,
    });
  }

  const docsPath = `/${config.get<string>('swagger.path') ?? 'api/docs'}`;
  const strictHelmet = helmet();
  const docsHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https://validator.swagger.io'],
      },
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path.startsWith(docsPath) ? docsHelmet : strictHelmet)(req, res, next),
  );

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  setupSession(app);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  setupSwagger(app);

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap');
  if (corsOrigins.length > 0) {
    Logger.log(`CORS allowed origins: ${corsOrigins.join(', ')}`, 'Bootstrap');
  }
}

void bootstrap();
