import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import type { ActivationView } from '@poc/contracts';
import { config, logger } from '../config';

@WebSocketGateway({
  namespace: 'activations',
  cors: { origin: config.uiOrigins },
})
export class ActivationGateway {
  @WebSocketServer()
  server?: Server;

  publish(view: ActivationView): void {
    if (!this.server) {
      logger.warn('WebSocket gateway todavía no está listo');
      return;
    }
    this.server.emit('activation.updated', view);
  }
}
