import { Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type {
  CreateActivationInput,
  CreateActivationResponse,
  ActivationView,
} from '@poc/contracts';
import { ActivationRepository } from './activation.repository';
import { ActivationGateway } from './activation.gateway';
import { logger } from '../config';

@Injectable()
export class ActivationService {
  constructor(
    private readonly repository: ActivationRepository,
    private readonly gateway: ActivationGateway,
  ) {}

  async create(
    input: CreateActivationInput,
  ): Promise<CreateActivationResponse> {
    const customerId =
      input.customerId?.trim() || `C-${randomInt(1000, 9999)}`;

    const view = await this.repository.create({
      customerId,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      planId: input.planId,
      simulateFailure: input.simulateFailure,
    });

    this.gateway.publish(view);

    return {
      activationId: view.id,
      customerId: view.customerId,
      status: view.status,
      correlationId: view.id,
    };
  }

  async list(limit?: number): Promise<ActivationView[]> {
    return this.repository.list(limit);
  }

  async getById(id: string): Promise<ActivationView> {
    const view = await this.repository.getById(id);
    if (!view) {
      throw new NotFoundException(`No existe la activación ${id}`);
    }
    return view;
  }

  publish(view: ActivationView): void {
    this.gateway.publish(view);
    logger.debug('Activación enviada por WebSocket', { activationId: view.id });
  }
}
