import User from '#models/user'
import { userValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

export default class AuthController {

    public async login({ auth, request, response }: HttpContext) {

        const email = request.input('email')
        const password = request.input('password')

        const user = await User.verifyCredentials(email, password)

        await auth.use('web').login(user)

        return response.ok({message: "logado com sucesso"})
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

        return response.ok({message: "logado com sucesso"})

    }

    public async signin({request, response}: HttpContext) {

        const data = request.all()
        const payload = await userValidator.validate(data)
        
        const user = await User.create({
            email: payload.email,
            password: payload.password
        })

        return response.ok(user);

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
}