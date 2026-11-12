import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  FAILURE_MODES,
  PLANS,
  type CreateActivationInput,
} from '@poc/contracts';
import { z } from 'zod';
import { ActivationService } from './activation.service';

const createSchema = z
  .object({
    customerId: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, guion y guion bajo')
      .optional(),
    contactEmail: z.string().trim().email().max(120),
    planId: z.enum(PLANS).default('PLAN_DIGITAL'),
    simulateFailure: z.enum(FAILURE_MODES).default('none'),
  })
  .strict();

@Controller('activations')
export class ActivationController {
  constructor(private readonly service: ActivationService) {}

  @Post()
  @HttpCode(202)
  async create(@Body() body: unknown) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Datos de activación inválidos',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return this.service.create(parsed.data as CreateActivationInput);
  }

  @Get()
  async list(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const items = await this.service.list(
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
    return { items };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.service.getById(id);
  }
}
