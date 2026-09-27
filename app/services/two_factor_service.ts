import { createHash, randomInt } from 'node:crypto'
import { DateTime } from 'luxon'
import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import User from '#models/user'
import TwoFactorCodeMail from '#mails/two_factor_code_mail'

/**
 * Regras:
 * - Código de 6 dígitos, válido por 5 minutos.
 * - Guardamos apenas o hash do código no banco (nunca o valor puro).
 * - O app cliente controla o cooldown de 60s / limite de 3 reenvios,
 *   mas o backend também limita tentativas de verificação erradas
 *   para evitar força bruta.
 */
export default class TwoFactorService {
  static readonly CODE_EXPIRATION_MINUTES = 5
  static readonly MAX_VERIFY_ATTEMPTS = 5

  private static hashCode(code: string, email: string): string {
    return createHash('sha256').update(`${email.toLowerCase()}:${code}`).digest('hex')
  }

  private static generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0')
  }

  /**
   * Gera um novo código, salva o hash no usuário e envia por e-mail.
   * Usado tanto no primeiro envio (login) quanto no reenvio.
   */
  static async sendCode(user: User): Promise<void> {
    const code = this.generateCode()

    user.twoFactorCodeHash = this.hashCode(code, user.email)
    user.twoFactorExpiresAt = DateTime.now().plus({ minutes: this.CODE_EXPIRATION_MINUTES })
    user.twoFactorAttempts = 0
    await user.save()

    // Sem SMTP configurado (ex.: ambiente de desenvolvimento), não há
    // como enviar o e-mail de verdade: registramos o código no log
    // para permitir testar o fluxo manualmente.
    if (!env.get('SMTP_HOST')) {
      logger.info(`[2FA] SMTP não configurado. Código para ${user.email}: ${code}`)
      return
    }

    await mail.send(
      new TwoFactorCodeMail(user.email, user.name, code, this.CODE_EXPIRATION_MINUTES)
    )
  }

  /**
   * Confirma o código informado pelo usuário. Retorna o motivo da falha
   * (ou null se o código for válido) para que o controller monte a
   * mensagem de erro adequada.
   */
  static async verifyCode(
    user: User,
    code: string
  ): Promise<'ok' | 'expired' | 'invalid' | 'too_many_attempts'> {
    if (!user.twoFactorCodeHash || !user.twoFactorExpiresAt) {
      return 'expired'
    }

    if (user.twoFactorAttempts >= this.MAX_VERIFY_ATTEMPTS) {
      return 'too_many_attempts'
    }

    if (DateTime.now() > user.twoFactorExpiresAt) {
      return 'expired'
    }

    const isValid = this.hashCode(code, user.email) === user.twoFactorCodeHash

    if (!isValid) {
      user.twoFactorAttempts += 1
      await user.save()
      return 'invalid'
    }

    await this.clearCode(user)
    return 'ok'
  }

  static async clearCode(user: User): Promise<void> {
    user.twoFactorCodeHash = null
    user.twoFactorExpiresAt = null
    user.twoFactorAttempts = 0
    await user.save()
  }
}
