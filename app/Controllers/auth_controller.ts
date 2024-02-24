import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

export default class AuthController {

    public async login({ auth, request, response }: HttpContext) {

        const email = request.input('email')
        const password = request.input('password')

        const user = await User.verifyCredentials(email, password)

        await auth.use('web').login(user)

        return response.ok("")
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