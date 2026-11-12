import { io, type Socket } from 'socket.io-client';
import type { ActivationView } from '@poc/contracts';
import { API_URL } from './api';

export interface ActivationSocketHandlers {
  onUpdate: (view: ActivationView) => void;
  onStatus: (connected: boolean) => void;
}

export function connectActivationSocket(
  handlers: ActivationSocketHandlers,
): Socket {
  const socket = io(`${API_URL}/activations`, {
    transports: ['websocket', 'polling'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 3_000,
  });

  socket.on('connect', () => handlers.onStatus(true));
  socket.on('disconnect', () => handlers.onStatus(false));
  socket.on('connect_error', () => handlers.onStatus(false));
  socket.on('activation.updated', (view: ActivationView) => {
    handlers.onUpdate(view);
  });

  return socket;
}
