import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import {
  EVENT_TYPES,
  type DomainEvent,
  type ActivationCompleted,
  type ActivationFailed,
} from '@poc/contracts';
import type { MongoContext } from '@poc/kafka-toolkit';
import { MONGO } from './providers';
import { logger } from './config';

export interface NotificationDoc {
  _id: string;
  activationId: string;
  customerId: string;
  eventType: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
  status: 'PENDING' | 'SENDING' | 'SENT';
  attempts: number;
  createdAt: Date;
  nextAttemptAt?: Date;
  claimedAt?: Date;
  sentAt?: Date;
  lastError?: string;
}

interface MailContent {
  recipient: string;
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, 160);
}

function layout(title: string, intro: string, body: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f4f1e8;font-family:'Segoe UI',Arial,sans-serif;color:#1b1b18">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#fffdf7;border:1px solid #ded8c8;border-radius:14px;overflow:hidden">
          <tr><td style="padding:26px 30px;border-bottom:1px solid #eee8d8">
            <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#6b6656">Activación de Servicios · FCyT</div>
            <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2">${title}</h1>
          </td></tr>
          <tr><td style="padding:28px 30px;font-size:15px;line-height:1.65">
            <p style="margin:0 0 16px">${intro}</p>
            ${body}
          </td></tr>
          <tr><td style="padding:18px 30px;background:#f7f3e8;color:#6b6656;font-size:12px">
            Este correo fue generado por la POC de Activación de Servicios con Kafka.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function completedContent(event: ActivationCompleted): MailContent {
  const plan = escapeHtml(event.payload.planId);
  const customer = escapeHtml(event.customerId);
  return {
    recipient: event.payload.contactEmail,
    subject: oneLine(`¡Tu ${plan} ya está activo!`),
    html: layout(
      'Servicio Activado con Éxito',
      `Hola, cliente <strong>${customer}</strong>. Completamos la activación de tu <strong>${plan}</strong>.`,
      `<p style="margin:0 0 10px"><strong>Cuenta de facturación:</strong> ${escapeHtml(event.payload.billingAccountId)}</p>
       <p style="margin:0 0 10px"><strong>Orden de aprovisionamiento:</strong> ${escapeHtml(event.payload.provisioningOrderId)}</p>
       <p style="margin:0">¡Ya podés disfrutar de tu servicio contratado!</p>`,
    ),
    text: `Hola, cliente ${customer}. Tu ${plan} ya está activo.\nFacturación: ${event.payload.billingAccountId}\nAprovisionamiento: ${event.payload.provisioningOrderId}`,
  };
}

function failedContent(event: ActivationFailed): MailContent {
  const plan = escapeHtml(event.payload.planId);
  const customer = escapeHtml(event.customerId);
  const step =
    event.payload.failedStep === 'billing'
      ? 'facturación'
      : 'aprovisionamiento de la línea';
  return {
    recipient: event.payload.contactEmail,
    subject: oneLine(`No pudimos activar tu ${plan}`),
    html: layout(
      'No pudimos completar la activación',
      `Hola, cliente <strong>${customer}</strong>. La activación no pudo completarse en el paso de <strong>${step}</strong>.`,
      `<p style="margin:0 0 10px"><strong>Motivo:</strong> ${escapeHtml(event.payload.reason)}</p>
       <p style="margin:0 0 10px">Si se había generado una cuenta de facturación, la cancelamos automáticamente como compensación de la saga.</p>
       <p style="margin:0">Podés reintentar la contratación desde el portal web.</p>`,
    ),
    text: `Hola, cliente ${customer}. La activación de tu ${plan} falló en ${step}.\nMotivo: ${event.payload.reason}`,
  };
}

@Injectable()
export class NotificationRepository implements OnModuleInit {
  constructor(@Inject(MONGO) private readonly mongo: MongoContext) {}

  private get collection() {
    return this.mongo.db.collection<NotificationDoc>('notifications');
  }

  async onModuleInit(): Promise<void> {
    await this.collection.createIndex(
      { activationId: 1, eventType: 1 },
      { unique: true, name: 'ux_activation_event' },
    );
    await this.collection.createIndex(
      { status: 1, nextAttemptAt: 1 },
      { name: 'ix_pending' },
    );
  }

  async handle(event: DomainEvent, session: ClientSession): Promise<void> {
    let content: MailContent | null = null;

    switch (event.eventType) {
      case EVENT_TYPES.ActivationCompleted:
        content = completedContent(event);
        break;
      case EVENT_TYPES.ActivationFailed:
        content = failedContent(event);
        break;
      default:
        return;
    }

    const notification: NotificationDoc = {
      _id: `ntf_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      activationId: event.correlationId,
      customerId: event.customerId,
      eventType: event.eventType,
      recipient: content.recipient,
      subject: content.subject,
      html: content.html,
      text: content.text,
      status: 'PENDING',
      attempts: 0,
      createdAt: new Date(),
    };

    await this.collection.insertOne(notification, { session });
    logger.info('Notificación encolada', {
      activationId: event.correlationId,
      eventType: event.eventType,
      recipient: content.recipient,
    });
  }
}
