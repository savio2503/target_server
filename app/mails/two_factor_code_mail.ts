import { BaseMail } from '@adonisjs/mail'

/**
 * E-mail com o código de verificação em duas etapas (2FA) ou de ativação
 * de cadastro, enviado no login ou no cadastro de usuário.
 */
export default class TwoFactorCodeMail extends BaseMail {
  from = undefined // usa o "from" padrão definido em config/mail.ts
  subject: string

  constructor(
    private userEmail: string,
    private userName: string,
    private code: string,
    private expiresInMinutes: number,
    private purpose: 'signup' | 'login' = 'login'
  ) {
    super()
    this.subject = purpose === 'signup' ? 'Seu código de ativação' : 'Seu código de verificação'
  }

  prepare() {
    const actionText =
      this.purpose === 'signup'
        ? 'Use o código abaixo para ativar seu cadastro:'
        : 'Use o código abaixo para concluir seu login:'

    const warningText =
      this.purpose === 'signup'
        ? `Esse código expira em ${this.expiresInMinutes} minutos. Se você não solicitou este cadastro, ignore este e-mail.`
        : `Esse código expira em ${this.expiresInMinutes} minutos. Se você não solicitou esse login, ignore este e-mail.`

    this.message
      .to(this.userEmail)
      .subject(this.subject)
      .html(`
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <p>Olá, ${this.userName || 'usuário'}!</p>
          <p>${actionText}</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; margin: 24px 0;">
            ${this.code}
          </p>
          <p>${warningText}</p>
        </div>
      `)
  }
}
