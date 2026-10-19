import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'

interface RateLimitRecord {
  count: number
  resetAt: number
}

// Armazena contadores em memória por chave (IP + rota)
const hitStore = new Map<string, RateLimitRecord>()

// Limpeza periódica de chaves expiradas a cada 5 minutos
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of hitStore.entries()) {
    if (now > record.resetAt) {
      hitStore.delete(key)
    }
  }
}, 5 * 60 * 1000).unref()

interface RateLimitOptions {
  maxRequests: number
  windowMs: number
  message?: string
}

export default function createRateLimiter(options: RateLimitOptions) {
  const { maxRequests, windowMs, message } = options

  return async function rateLimitMiddleware({ request, response }: HttpContext, next: NextFn) {
    const ip = request.ip()
    const path = request.url(false)
    const key = `${ip}:${path}`
    const now = Date.now()

    let record = hitStore.get(key)

    if (!record || now > record.resetAt) {
      record = {
        count: 1,
        resetAt: now + windowMs,
      }
      hitStore.set(key, record)
    } else {
      record.count += 1
    }

    const remaining = Math.max(0, maxRequests - record.count)
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000)

    response.header('X-RateLimit-Limit', maxRequests.toString())
    response.header('X-RateLimit-Remaining', remaining.toString())
    response.header('X-RateLimit-Reset', resetSeconds.toString())

    if (record.count > maxRequests) {
      logger.warn(`[RateLimit] Limite excedido para IP ${ip} na rota ${path}`)
      response.header('Retry-After', resetSeconds.toString())
      return response.status(429).send({
        errors: [
          {
            message:
              message ||
              `Muitas requisições. Por favor, aguarde ${resetSeconds} segundos antes de tentar novamente.`,
          },
        ],
      })
    }

    return next()
  }
}
