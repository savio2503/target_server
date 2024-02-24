import Coin from '#models/coin';
import { coinValidator } from '#validators/coin';
import type { HttpContext } from '@adonisjs/core/http'

export default class CoinsController {
    public async allCoin({ response }: HttpContext) {

        const coins = await Coin.query().orderBy('id');

        return response.ok(coins);
    }

    public async storeCoin({ request, response, auth } : HttpContext) {

        const data = request.all()
        const payload = await coinValidator.validate(data)

        const coin = await Coin.create({
            name: payload.name,
            symbol: payload.symbol
        })

        return response.ok(coin);
    }
}