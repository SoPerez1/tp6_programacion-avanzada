import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { InfrastructureLifecycle } from './infrastructure.lifecycle';
import { LoyaltyConsumer } from './loyalty.consumer';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyRepository } from './loyalty.repository';
import { mongoProvider, producerProvider } from './providers';

@Module({
  controllers: [LoyaltyController, HealthController],
  providers: [
    mongoProvider,
    producerProvider,
    LoyaltyRepository,
    LoyaltyConsumer,
    InfrastructureLifecycle,
  ],
})
export class AppModule {}
