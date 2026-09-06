import User from '#models/user'
import { avatarUpdateValidator, userValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

export default class AuthController {

    public async login({ auth, request, response }: HttpContext) {

        const email = request.input('email')
        const password = request.input('password')

        const user = await User.verifyCredentials(email, password)

        await auth.use('web').login(user)

        return response.ok({
            message: "logado com sucesso",
            name: user.name,
            image: user.avatarUrl,
            isPremium: user.isPremium
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
}