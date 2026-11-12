import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  logger.info('billing-service iniciado');
}

bootstrap().catch((error) => {
  logger.error('No se pudo iniciar billing-service', { error });
  process.exit(1);
});
