import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Coin from 'App/Models/Coin';
import CoinValidator from 'App/Validators/CoinValidator';

export default class CoinsController {

    public async allCoin({ response }: HttpContextContract) {

        const coins = await Coin.query().orderBy('id');

        return response.ok(coins);
    }

    public async storeCoin({ request, response } : HttpContextContract) {

        const payload = await request.validate(CoinValidator);

        const coin = await Coin.create({
            name: payload.name,
            symbol: payload.symbol
        })

        return response.ok(coin);
    }
}
