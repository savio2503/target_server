import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import TwoFactorCodeMail from '#mails/two_factor_code_mail'

export default class TestMail extends BaseCommand {
  static commandName = 'mail:test'
  static description = 'Envia um e-mail de teste com código 2FA para validar a configuração SMTP'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Endereço de e-mail de destino para receber o teste' })
  declare email: string

  async run() {
    this.logger.info(`Validando configurações de SMTP...`)
    this.logger.info(`Host: ${env.get('SMTP_HOST') || '(não definido)'}`)
    this.logger.info(`Porta: ${env.get('SMTP_PORT') || '(não definido)'}`)
    this.logger.info(`Usuário: ${env.get('SMTP_USERNAME') || '(não definido)'}`)
    this.logger.info(`Remetente: ${env.get('MAIL_FROM_ADDRESS') || '(não definido)'}`)

    if (!env.get('SMTP_HOST') || !env.get('SMTP_USERNAME') || !env.get('SMTP_PASSWORD')) {
      this.logger.error(
        'Configurações SMTP ausentes no arquivo .env. Verifique SMTP_HOST, SMTP_PORT, SMTP_USERNAME e SMTP_PASSWORD.'
      )
      return
    }

    const testCode = '849201'
    this.logger.info(`Enviando e-mail de teste com código ${testCode} para ${this.email}...`)

    try {
      await mail.send(new TwoFactorCodeMail(this.email, 'Usuário de Teste', testCode, 5))
      this.logger.success(`E-mail enviado com sucesso para ${this.email}! Verifique sua caixa de entrada e spam.`)
    } catch (error) {
      this.logger.error(`Falha no envio do e-mail: ${error.message}`)
      if (error.message?.includes('Invalid login') || error.message?.includes('Username and Password not accepted')) {
        this.logger.warning(
          'Dica: Se estiver usando Gmail, certifique-se de que usou uma "Senha de App" de 16 letras, e não sua senha normal de login do Google.'
        )
      }
    }
  }
}
