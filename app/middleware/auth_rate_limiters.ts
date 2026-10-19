import createRateLimiter from '#middleware/rate_limiter_middleware'

// Limite para login/signin: max 10 tentativas por minuto por IP
export const authRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000,
  message: 'Muitas tentativas de autenticação. Por favor, aguarde 1 minuto antes de tentar novamente.',
})

// Limite para reenvio de 2FA: max 4 requisições em 5 minutos por IP
export const twoFactorResendRateLimiter = createRateLimiter({
  maxRequests: 4,
  windowMs: 5 * 60 * 1000,
  message: 'Limite de reenvio de código excedido. Por favor, aguarde alguns minutos.',
})

// Limite para verificação de 2FA: max 10 tentativas em 5 minutos por IP
export const twoFactorVerifyRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 5 * 60 * 1000,
  message: 'Muitas tentativas de validação de código 2FA. Por favor, aguarde.',
})
