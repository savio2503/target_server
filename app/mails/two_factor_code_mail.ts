import { BaseMail } from '@adonisjs/mail'

/**
 * E-mail com o código de verificação em duas etapas (2FA),
 * enviado sempre que o usuário faz login (ou termina o
 * cadastro, já que o app loga automaticamente em seguida).
 */
export default class TwoFactorCodeMail extends BaseMail {
  from = undefined // usa o "from" padrão definido em config/mail.ts
  subject = 'Seu código de verificação'

  constructor(
    private userEmail: string,
    private userName: string,
    private code: string,
    private expiresInMinutes: number
  ) {
    super()
  }

  prepare() {
    this.message
      .to(this.userEmail)
      .subject(this.subject)
      .html(`
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <p>Olá, ${this.userName || 'usuário'}!</p>
          <p>Use o código abaixo para concluir seu login:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; margin: 24px 0;">
            ${this.code}
          </p>
          <p>Esse código expira em ${this.expiresInMinutes} minutos. Se você não solicitou esse login, ignore este e-mail.</p>
        </div>
      `)
  }
}
