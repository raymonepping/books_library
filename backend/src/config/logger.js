import winston from 'winston'

const { combine, timestamp, colorize, printf, errors, json } = winston.format

const DEV = process.env.NODE_ENV !== 'production'
const CONTAINER = process.env.CONTAINER_NAME || 'bibliotheek-backend'

// Strip sensitive keys from log metadata before writing
const redact = winston.format((info) => {
  for (const key of ['password', 'token', 'jwt', 'apiKey', 'CB_PASSWORD', 'authorization', 'secret']) {
    if (key in info) info[key] = '[redacted]'
  }
  return info
})

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, service: _svc, ...meta }) => {
    const metaStr =
      Object.keys(meta).length > 2
        ? `\n${JSON.stringify(meta, null, 2)}`
        : Object.keys(meta).length > 0
          ? ` ${JSON.stringify(meta)}`
          : ''
    return stack
      ? `${ts} [${level}] [${CONTAINER}] ${message}\n${stack}${metaStr}`
      : `${ts} [${level}] [${CONTAINER}] ${message}${metaStr}`
  })
)

const prodFormat = combine(timestamp(), errors({ stack: true }), json())

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (DEV ? 'debug' : 'info'),
  defaultMeta: { service: 'bibliotheek' },
  format: DEV ? combine(redact(), devFormat) : combine(redact(), prodFormat),
  transports: [new winston.transports.Console()],
  exitOnError: false,
})

// Morgan stream — routes HTTP access logs through winston
logger.stream = { write: (msg) => logger.http(msg.trimEnd()) }
