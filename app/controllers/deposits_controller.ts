import Deposit from '#models/deposit';
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger';
import db from '@adonisjs/lucid/services/db'
import HistoricsController from './historics_controller.js';
import Historic from '#models/historic';
import Lastupdate from '#models/lastupdate';
import { DateTime } from 'luxon';
import Target from '#models/target';
import TargetAllCacheService from '#services/target_all_cache_service';

export default class DepositsController {

    public async get({ params, response }: HttpContext) {
        const idTarget = params.id;
            
        try {

            const deposits = await db
                .from('deposits')
                .select(db.rawQuery(`sum(valor) as valor, date_format(created_at, '%Y/%m') as mes`))
                .where('target_id',idTarget)
                .groupByRaw(`date_format(created_at, '%Y/%m')`)
                .orderByRaw(`date_format(created_at, '%Y/%m') desc`)


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

    public async depositForTarget({ request, response, auth }: HttpContext) {
        const { id, valor } = request.only(['id','valor']);

        try {
            const user = await auth.getUserOrFail()
            const target = await Target.findOrFail(id)

            const newDeposit = await Deposit.create({
                targetId: id,
                valor: valor,
            });

            await Lastupdate.create({
                table: 'targets',
                action: 'update',
                detail: target.id.toString(),
                dateUpdate: DateTime.now(),
                user: target.userId,
            })

            await TargetAllCacheService.markUserStale(target.userId)

            logger.info(`Novo depósito criado para target_id ${id} com valor ${valor} userId=${user.id}`);

            return response.created(newDeposit);
        } catch(error) {
            logger.error(`Erro ao criar depósito: ${error}`);
            return response.badGateway(`Erro ao criar depósito: ${error}`);
        }
    }

    public async reset({ auth, params, response }: HttpContext) {

        const idTarget = params.id;
        const userAuth = await auth.getUserOrFail()

        const accumulatedValue = (await db
            .query()
            .from('deposits')
            .where('target_id', idTarget)
            .sum('valor','soma')).at(0).soma

        logger.info(`Valor acumulado para target_id ${idTarget}: ${accumulatedValue}`)

        const rowsdeleted = await db
            .query()
            .from('deposits')
            .where('target_id', idTarget)
            .delete()

        logger.info(`Linhas deletadas: ${rowsdeleted}`)

        await HistoricsController.processDeposit(accumulatedValue, userAuth.id)
        await TargetAllCacheService.markUserStale(userAuth.id)

        logger.info('saveDeposit: ' + accumulatedValue + ', user: ' + userAuth.id)

        await Historic.create({
            valor: accumulatedValue,
            userId: userAuth.id
        });
        
        await Lastupdate.create({
            table: 'targets',
            action: 'all',
            detail: idTarget.toString(),
            dateUpdate: DateTime.now(),
            user: userAuth.id,
        })
        
        return response.ok({message: `Depósitos resetados para target_id ${idTarget}`, rowsdeleted})
    }
}