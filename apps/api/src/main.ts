import 'reflect-metadata';
import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';
import { Rfc9457ExceptionFilter } from './common/filters/rfc9457-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: [env.APP_URL, env.ADMIN_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new Rfc9457ExceptionFilter());

  await app.listen(env.API_PORT);
  app.get(Logger).log(`OmniSell API ready on http://localhost:${env.API_PORT}/v1`, 'bootstrap');
}

void bootstrap();