import Deposit from '#models/deposit';
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger';
import db from '@adonisjs/lucid/services/db'

export default class DepositsController {
    public async get({ params, response }: HttpContext) {
        const idTarget = params.id;

        const deposits = await Deposit.query()
            .where('target_id', idTarget)
            .orderBy('created_at', 'desc')

        for (const deposit of deposits) {
            deposit.valor = Number(deposit.valor)
        }

        logger.info(`${deposits}`)

        return response.ok(deposits);
    }

    public async getSum({ params, response}: HttpContext) {

        const idTarget = params.id;

        const value = (await db
            .query()
            .from('deposits')
            .where('target_id', idTarget)
            .sum('valor','soma')).at(0).soma

        return response.ok(value)
    }
}