import User from '#models/user'
import {
    avatarUpdateValidator,
    cancelRegistrationValidator,
    nameUpdateValidator,
    twoFactorResendValidator,
    twoFactorVerifyValidator,
    userValidator,
} from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import TwoFactorService from '#services/two_factor_service'
import { OAuth2Client } from 'google-auth-library'

const googleOAuthClient = new OAuth2Client()

/**
 * Em produção o 2FA é sempre exigido. Em desenvolvimento/teste ele
 * fica desligado por padrão (para não depender de SMTP local),
 * mas pode ser forçado com TWO_FACTOR_ENABLED=true no .env.
 */
function isTwoFactorEnabled(): boolean {
    const explicit = env.get('TWO_FACTOR_ENABLED')
    if (explicit !== undefined) return explicit
    return app.inProduction
}

export default class AuthController {

    /**
     * Passo 1 do login: valida e-mail/senha.
     * Se o usuário ainda não foi verificado (isVerified: false), envia o código de ativação.
     * Em produção (ou com TWO_FACTOR_ENABLED=true), envia o código de 2FA e aguarda a
     * confirmação em `verifyTwoFactor`. Em desenvolvimento, loga direto (bypass).
     */
    public async login({ auth, request, response }: HttpContext) {

        const email = request.input('email')
        const password = request.input('password')

        const user = await User.verifyCredentials(email, password)

        // Se o cadastro ainda não foi ativado com o código
        if (!user.isVerified) {
            await TwoFactorService.sendCode(user, 'signup')

            return response.ok({
                message: "codigo_enviado",
                email: user.email,
            })
        }

        if (!isTwoFactorEnabled()) {
            await auth.use('web').login(user)

            return response.ok({
                message: "logado com sucesso",
                name: user.name,
                image: user.avatarUrl,
                isPremium: user.isPremium
            })
        }

        await TwoFactorService.sendCode(user, 'login')

        return response.ok({
            message: "codigo_enviado",
            email: user.email,
        })
    }

    /**
     * Passo 2: confirma o código recebido por e-mail (para login ou ativação de cadastro)
     * e, se válido, autentica a sessão do usuário e ativa o cadastro se pendente.
     */
    public async verifyTwoFactor({ auth, request, response }: HttpContext) {

        const payload = await twoFactorVerifyValidator.validate(request.all())

        const user = await User.findBy('email', payload.email)

        if (!user) {
            return response.badRequest({ errors: [{ message: 'Usuário não encontrado' }] })
        }

        const result = await TwoFactorService.verifyCode(user, payload.code)

        if (result === 'ok') {
            if (!user.isVerified) {
                user.isVerified = true
                await user.save()
            }

            await auth.use('web').login(user)

            return response.ok({
                message: "logado com sucesso",
                name: user.name,
                image: user.avatarUrl,
                isPremium: user.isPremium
            })
        }

        const messages: Record<string, string> = {
            expired: 'Código expirado. Solicite um novo código.',
            invalid: 'Código inválido.',
            too_many_attempts: 'Muitas tentativas incorretas. Solicite um novo código.',
        }

        return response.badRequest({ errors: [{ message: messages[result] }] })
    }

    /**
     * Reenvia um novo código de verificação para o e-mail informado.
     * Se o usuário ainda não confirmou o cadastro, reenvia como 'signup'.
     */
    public async resendTwoFactor({ request, response }: HttpContext) {

        const payload = await twoFactorResendValidator.validate(request.all())

        const user = await User.findBy('email', payload.email)

        if (!user) {
            return response.badRequest({ errors: [{ message: 'Usuário não encontrado' }] })
        }

        const purpose = user.isVerified ? 'login' : 'signup'
        await TwoFactorService.sendCode(user, purpose)

        return response.ok({
            message: "codigo_reenviado",
            email: user.email,
        })
    }

    public async loginWithGoogle({auth, request, response} : HttpContext) {

        const { idToken, email: fallbackEmail, name: fallbackName, photo: fallbackPhoto, uid: fallbackUid } = request.only([
            'idToken',
            'email',
            'name',
            'photo',
            'uid',
        ])

        let email = fallbackEmail
        let name = fallbackName
        let photo = fallbackPhoto
        let googleUid = fallbackUid

        if (idToken) {
            try {
                const audience = env.get('GOOGLE_CLIENT_ID')
                const ticket = await googleOAuthClient.verifyIdToken({
                    idToken,
                    audience: audience || undefined,
                })
                const payload = ticket.getPayload()

                if (!payload || !payload.email) {
                    return response.unauthorized({ errors: [{ message: 'Token do Google inválido' }] })
                }

                email = payload.email
                name = payload.name || name || email.split('@')[0]
                photo = payload.picture || photo || null
                googleUid = payload.sub || googleUid
            } catch (err: any) {
                logger.error(`[GoogleAuth] Falha ao verificar idToken: ${err.message}`)
                return response.unauthorized({ errors: [{ message: 'Falha na validação do token do Google' }] })
            }
        } else if (app.inProduction) {
            return response.badRequest({ errors: [{ message: 'idToken do Google é obrigatório em ambiente de produção' }] })
        }

        if (!email) {
            return response.badRequest({ errors: [{ message: 'E-mail não fornecido' }] })
        }

        let user = await User.findBy('email', email)

        if (!user) {
            user = await User.create({
                email: email,
                name: name,
                avatarUrl: photo,
                googleUid: googleUid,
                password: Math.random().toString(36).slice(-8),
                isVerified: true
            })
        } else if (googleUid && !user.googleUid) {
            user.googleUid = googleUid
            if (!user.isVerified) {
                user.isVerified = true
            }
            await user.save()
        }

        await auth.use('web').login(user)

        return response.ok({
            message: "logado com sucesso",
            isPremium: user.isPremium
        })

    }

    /**
     * Cadastro de usuário:
     * Salva o usuário no banco com isVerified: false,
     * dispara o e-mail de ativação de cadastro com o código de 6 dígitos,
     * e retorna status informando que o código foi enviado.
     */
    public async signin({request, response}: HttpContext) {

        logger.info('signin called')

        const data = request.all()
        const payload = await userValidator.validate(data)

        let user = await User.findBy('email', payload.email)

        if (user) {
            if (user.isVerified) {
                return response.badRequest({ errors: [{ message: 'E-mail já cadastrado' }] })
            }
            // Conta pendente de ativação: atualiza os dados e reenvia código
            user.password = payload.password
            user.name = payload.name ?? user.name
            user.avatarUrl = payload.avatar ?? user.avatarUrl
            await user.save()
        } else {
            user = await User.create({
                email: payload.email,
                password: payload.password,
                name: payload.name,
                avatarUrl: payload.avatar,
                isVerified: false,
            })
        }

        await TwoFactorService.sendCode(user, 'signup')

        return response.ok({
            message: "codigo_enviado",
            email: user.email,
        })
    }

    /**
     * Cancela o processo de cadastro do usuário.
     * Segurança: só permite excluir usuários cujo `is_verified` é false.
     * Se a conta já estiver verificada, recusa a exclusão.
     */
    public async cancelRegistration({ request, response }: HttpContext) {
        const payload = await cancelRegistrationValidator.validate(request.all())

        const user = await User.findBy('email', payload.email)

        if (!user) {
            return response.ok({ message: 'cadastro_cancelado' })
        }

        if (user.isVerified) {
            return response.badRequest({
                errors: [{ message: 'Não é possível cancelar o cadastro de uma conta já verificada.' }],
            })
        }

        await user.delete()
        logger.info(`[Auth] Cadastro cancelado e registro removido para: ${payload.email}`)

        return response.ok({ message: 'cadastro_cancelado' })
    }

    public async me({ auth, response }: HttpContext) {

        try {
            const user = await auth.getUserOrFail()
            let data = {
                id_user: user.id,
                email: user.email
            };

            return response.ok(data)
        } catch (error) {
            logger.info(`error: ${error}`)
        }
    }

    public async updateAvatar({ auth, request, response }: HttpContext) {
 
        try {
            const user = await auth.getUserOrFail()
 
            const payload = await avatarUpdateValidator.validate(request.all())
 
            let avatar = payload.avatar.trim()
 
            // Remove o prefixo de data URI (ex: "data:image/png;base64,") caso exista,
            // guardando sempre o base64 "puro" no banco.
            const dataUriMatch = avatar.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/)
            if (dataUriMatch) {
                avatar = dataUriMatch[1]
            }
 
            const isUrl = /^https?:\/\//i.test(avatar)
 
            if (!isUrl) {
                // Valida se o restante do conteúdo é um base64 válido
                const isValidBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(avatar) && avatar.length % 4 === 0
 
                if (!isValidBase64) {
                    return response.badRequest({ message: 'avatar deve ser uma URL válida ou uma string base64 válida.' })
                }
            }
 
            user.avatarUrl = avatar
            await user.save()
 
            return response.ok({
                message: 'Avatar atualizado com sucesso',
                avatarUrl: user.avatarUrl
            })
 
        } catch (error) {
            logger.info(`error updateAvatar: ${error}`)
            return response.badRequest({ message: 'Não foi possível atualizar o avatar.' })
        }
    }

    public async updateName({ auth, request, response }: HttpContext) {
        try {
            const user = await auth.getUserOrFail()
            const payload = await nameUpdateValidator.validate(request.all())

            user.name = payload.name
            await user.save()

            return response.ok({
                message: 'Nome atualizado com sucesso',
                name: user.name
            })
        } catch (error) {
            logger.info(`error updateName: ${error}`)
            return response.badRequest({ message: 'Não foi possível atualizar o nome.' })
        }
    }
}
