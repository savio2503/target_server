import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import User from 'App/Models/User';
import Logger from '@ioc:Adonis/Core/Logger';

export default class AuthController {

    public async login({auth, request, response} : HttpContextContract) {
        const email = request.input('email')
        const password = request.input('password')
		
		Logger.info('email: ' + email + ", senha: " + password)

        try {

            let expira = '7days';
            const user = await User.findByOrFail('email', email)

            const token = await auth.use('api').attempt(email, password, { expiresIn: expira, name: user.serialize().email,})

            response.ok(token)

        } catch (error) {
            return response.badRequest('Invalid credentials: ' + error)
        }
    }

    public async me({auth, response} : HttpContextContract) {

        const user = await auth.use('api').authenticate();
        let data;

        const userRes = await User.findByOrFail('id', user.id);

        data = {
            id_user: userRes?.id,
			email: userRes?.email
        }

        return response.ok(data);
    }
}
