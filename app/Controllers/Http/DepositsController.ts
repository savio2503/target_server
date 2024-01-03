import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Deposit from 'App/Models/Deposit';
import Database from '@ioc:Adonis/Lucid/Database';

export default class DepositsController {

    public async get({ params, response }: HttpContextContract) {
        const idTarget = params.id;

        const deposits = await Deposit.query()
            .where('target_id', idTarget)
            .orderBy('created_at', 'desc')

        for (const deposit of deposits) {

            deposit.valor = Number(deposit.valor)
        }

        return response.ok(deposits);
    }

    public async getSum({ params, response}: HttpContextContract) {

        const idTarget = params.id;

        const value = (await Database
            .query()
            .from('deposits')
            .where('target_id', idTarget)
            .sum('valor','soma')).at(0).soma

        return response.ok(value)
    }
}
