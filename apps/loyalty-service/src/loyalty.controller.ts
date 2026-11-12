import { Controller, Get, Query } from '@nestjs/common';
import { LoyaltyRepository } from './loyalty.repository';

@Controller('api/loyalty')
export class LoyaltyController {
  constructor(private readonly repository: LoyaltyRepository) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : 50;
    return {
      items: await this.repository.list(
        Number.isFinite(parsed) ? parsed : 50,
      ),
    };
  }
}
