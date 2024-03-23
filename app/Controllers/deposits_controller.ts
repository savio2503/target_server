import Deposit from '#models/deposit';
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger';
import db from '@adonisjs/lucid/services/db'

export default class DepositsController {

    public async get({ params, response }: HttpContext) {
        const idTarget = params.id;
            
        try {

            const deposits = await db
                .from('deposits')
                .select(db.rawQuery(`sum(valor) as valor, date_format(created_at, '%m/%Y') as mes`))
                .where('target_id',idTarget)
                .groupByRaw(`date_format(created_at, '%m/%Y')`)
                .orderByRaw(`date_format(created_at, '%m/%Y') desc`)


            for (const deposit of deposits) {
                deposit.valor = Number(deposit.valor)
                logger.info(`valor: ${deposit.valor}`)
            }

            //logger.info(`${deposits}`)

            return response.ok(deposits);
        } catch (error) {
            return response.badGateway(`erro: ${error}`)
        }
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