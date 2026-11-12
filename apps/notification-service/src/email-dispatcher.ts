import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { MongoContext } from '@poc/kafka-toolkit';
import { Inject } from '@nestjs/common';
import { config, logger } from './config';
import { MONGO } from './providers';
import type { NotificationDoc } from './notification.repository';

@Injectable()
export class EmailDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly transporter: Transporter;
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(@Inject(MONGO) private readonly mongo: MongoContext) {
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }

  private get collection() {
    return this.mongo.db.collection<NotificationDoc>('notifications');
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, config.mailIntervalMs);
    void this.tick();
    logger.info('Despachador de emails iniciado', {
      smtp: `${config.smtpHost}:${config.smtpPort}`,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.transporter.close();
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;

    try {
      const now = new Date();
      const pending = await this.collection
        .find({
          status: 'PENDING',
          $or: [
            { nextAttemptAt: { $exists: false } },
            { nextAttemptAt: { $lte: now } },
          ],
        })
        .sort({ createdAt: 1 })
        .limit(20)
        .toArray();

      for (const notification of pending) {
        const claimed = await this.collection.findOneAndUpdate(
          { _id: notification._id, status: 'PENDING' },
          { $set: { status: 'SENDING', claimedAt: new Date() } },
          { returnDocument: 'after' },
        );

        if (!claimed) continue;

        try {
          await this.transporter.sendMail({
            from: config.mailFrom,
            to: claimed.recipient,
            subject: claimed.subject,
            text: claimed.text,
            html: claimed.html,
          });

          await this.collection.updateOne(
            { _id: claimed._id },
            {
              $set: { status: 'SENT', sentAt: new Date() },
              $inc: { attempts: 1 },
              $unset: { nextAttemptAt: '', claimedAt: '' },
            },
          );

          logger.info('Email enviado', {
            notificationId: claimed._id,
            activationId: claimed.activationId,
            recipient: claimed.recipient,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const retryDelayMs = Math.min(
            30_000,
            1_000 * 2 ** Math.min(claimed.attempts, 5),
          );

          await this.collection.updateOne(
            { _id: claimed._id },
            {
              $set: {
                status: 'PENDING',
                lastError: message.slice(0, 1_000),
                nextAttemptAt: new Date(Date.now() + retryDelayMs),
              },
              $inc: { attempts: 1 },
              $unset: { claimedAt: '' },
            },
          );

          logger.warn('Falló el envío del email, se reintentará', {
            notificationId: claimed._id,
            error: message,
            retryDelayMs,
          });
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}
