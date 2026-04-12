type LogLevel = "info" | "warn" | "error"

type LogContext = Record<string, unknown>

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const isProd = process.env.NODE_ENV === "production"
    return {
      name: error.name,
      message: error.message,
      // Stack trace uniquement hors production — en prod elle expose la structure interne
      // aux personnes ayant accès aux logs (Vercel dashboard, exports, etc.)
      ...(isProd ? {} : { stack: error.stack }),
    }
  }

  return error
}

function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      key === "error" ? serializeError(value) : value,
    ]),
  )
}

function log(level: LogLevel, event: string, context?: LogContext) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeContext(context),
  }

  const line = JSON.stringify(payload)

  if (level === "error") {
    console.error(line)
    return
  }

  if (level === "warn") {
    console.warn(line)
    return
  }

  console.info(line)
}

export const logger = {
  info(event: string, context?: LogContext) {
    log("info", event, context)
  },
  warn(event: string, context?: LogContext) {
    log("warn", event, context)
  },
  error(event: string, context?: LogContext) {
    log("error", event, context)
  },
}

export function logServerActionError(
  event: string,
  error: unknown,
  context?: LogContext,
) {
  logger.error(event, {
    ...context,
    error,
  })
}
