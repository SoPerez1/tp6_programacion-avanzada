import { Controller, Get, Inject } from '@nestjs/common';
import type { MongoContext } from '@poc/kafka-toolkit';
import { config } from './config';
import { MONGO } from './providers';

@Controller('health')
export class HealthController {
  constructor(@Inject(MONGO) private readonly mongo: MongoContext) {}

  @Get()
  async check() {
    await this.mongo.db.command({ ping: 1 });
    return {
      status: 'ok',
      service: 'activation-api',
      database: config.mongoDb,
      kafka: config.brokers,
      now: new Date().toISOString(),
    };
  }
}
