import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Server as HttpServer } from 'http';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { LoggerService } from '@nestjs/common';
import { VoipService } from './voip/voip.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  app.enableCors({
    origin: process.env.ALLOWED_HOST
      ? (JSON.parse(process.env.ALLOWED_HOST) as string[])
      : ['http://localhost:5173'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Authorization',
    credentials: true,
  });

  await app.init();
  const httpServer = app.getHttpServer() as HttpServer;

  const voipService = app.get(VoipService);
  voipService.init(httpServer);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error) => {
  console.error('Application failed to start:', error);
  process.exit(1);
});
