import User from '#models/user'
import {
    avatarUpdateValidator,
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
     * Passo 1 do login: valida e-mail/senha. Em produção (ou com
     * TWO_FACTOR_ENABLED=true), envia o código de 2FA e aguarda a
     * confirmação em `verifyTwoFactor`. Em desenvolvimento, loga
     * direto (bypass), mantendo o comportamento antigo.
     */
    public async login({ auth, request, response }: HttpContext) {

        const email = request.input('email')
        const password = request.input('password')

        const user = await User.verifyCredentials(email, password)

        if (!isTwoFactorEnabled()) {
            await auth.use('web').login(user)

            return response.ok({
                message: "logado com sucesso",
                name: user.name,
                image: user.avatarUrl,
                isPremium: user.isPremium
            })
        }

        await TwoFactorService.sendCode(user)

        return response.ok({
            message: "codigo_enviado",
            email: user.email,
        })
    }

    /**
     * Passo 2 do login: confirma o código de 2FA recebido por e-mail
     * e, se válido, efetivamente autentica a sessão do usuário.
     */
    public async verifyTwoFactor({ auth, request, response }: HttpContext) {

        const payload = await twoFactorVerifyValidator.validate(request.all())

        const user = await User.findBy('email', payload.email)

        if (!user) {
            return response.badRequest({ errors: [{ message: 'Usuário não encontrado' }] })
        }

        const result = await TwoFactorService.verifyCode(user, payload.code)

        if (result === 'ok') {
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
     * Reenvia um novo código de 2FA para o e-mail informado.
     * O controle de "máximo de 3 reenvios / aguardar 5 minutos" é
     * feito no app; aqui apenas geramos e enviamos um novo código.
     */
    public async resendTwoFactor({ request, response }: HttpContext) {

        const payload = await twoFactorResendValidator.validate(request.all())

        const user = await User.findBy('email', payload.email)

        if (!user) {
            return response.badRequest({ errors: [{ message: 'Usuário não encontrado' }] })
        }

        await TwoFactorService.sendCode(user)

        return response.ok({
            message: "codigo_reenviado",
            email: user.email,
        })
    }

    public async loginWithGoogle({auth, request, response} : HttpContext) {

        const { email, name, photo, uid } = request.only(['email', 'name', 'photo', 'uid'])

        let user = await User.findBy('email', email)

        if (!user) {
            user = await User.create({
                email: email,
                name: name,
                avatarUrl: photo,
                googleUid: uid,
                password: Math.random().toString(36).slice(-8)
            })
        }

        await auth.use('web').login(user)

        return response.ok({
            message: "logado com sucesso",
            isPremium: user.isPremium
        })

    }

    public async signin({request, response}: HttpContext) {

        logger.info('signin called')

        const data = request.all()
        const payload = await userValidator.validate(data)

        //logger.info(`payload: ${JSON.stringify(payload)}`)
        
        await User.create({
            email: payload.email,
            password: payload.password,
            name: payload.name,
            avatarUrl: payload.avatar
        })

        //logger.info(`user created: ${JSON.stringify(user)}`)

        return response.ok("cadastrado com sucesso");

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