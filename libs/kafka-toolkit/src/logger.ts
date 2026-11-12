export interface LogMeta {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

function normalizeMeta(meta: LogMeta = {}): LogMeta {
  const normalized: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    normalized[key] = value instanceof Error ? value.message : value;
  }
  return normalized;
}

/**
 * Logger de una línea por entrada. En Docker se lee cómodo con
 * `docker compose logs -f onboarding-api`.
 */
export function createLogger(service: string): Logger {
  const write = (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: LogMeta,
  ): void => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service,
      message,
      ...normalizeMeta(meta),
    });

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (message, meta) => {
      if (process.env.LOG_LEVEL === 'debug') write('debug', message, meta);
    },
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}
