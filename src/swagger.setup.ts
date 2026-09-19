import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SESSION_AUTH = 'session';

export function setupSwagger(app: INestApplication): void {
  const config = app.get(ConfigService);
  if (!config.get<boolean>('swagger.enabled')) {
    return;
  }

  const path = config.get<string>('swagger.path') ?? 'api/docs';
  const cookieName = config.get<string>('session.name') ?? 'sid';

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('coin-sweep-eoa API')
      .setDescription('세션(쿠키) 기반 로그인 API')
      .setVersion('0.0.1')
      .addCookieAuth(cookieName, { type: 'apiKey', in: 'cookie', name: cookieName }, SESSION_AUTH)
      .build(),
  );

  SwaggerModule.setup(path, app, document, {
    jsonDocumentUrl: `${path}/json`,
    swaggerOptions: {
      withCredentials: true,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  Logger.log(`Swagger UI: /${path}`, 'Bootstrap');
}
