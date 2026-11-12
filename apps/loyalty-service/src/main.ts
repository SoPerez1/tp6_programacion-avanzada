import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config, logger } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: config.uiOrigins });
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  logger.info('partner-feed-service escuchando', { port: config.port });
}

bootstrap().catch((error) => {
  logger.error('No se pudo iniciar partner-feed-service', { error });
  process.exit(1);
});
