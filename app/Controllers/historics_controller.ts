import Deposit from '#models/deposit';
import Historic from '#models/historic';
import Target from '#models/target';
import { historicValidator } from '#validators/historic';
import logger from '@adonisjs/core/services/logger';
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class HistoricsController {
    public async get({ auth, response }: HttpContext ) {

        const userAuth = await auth.getUserOrFail()

        const historics = await Historic.query()
            .where('user_id', userAuth.id)
            .orderBy('created_at', 'desc');


        logger.info('historic: ' + historics.toString())

        return response.ok(historics)
    }

    public static async processDeposit(valor: number, userId: number) {
        
        var somaPosicaoAtivo = (await db
            .query()
            .from('targets')
            .where('user_id', userId)
            .where('ativo', '1')
            .sum('posicao', 'soma')).at(0).soma

        somaPosicaoAtivo = parseInt(somaPosicaoAtivo)

        var resposta: Deposit[] = [];
        var valorResto: number = 0.0;

        while (true) {
            valorResto = 0.0

            const targets = await Target.query()
            .where('user_id', userId)
            .where('ativo', '1')

            for await (const target of targets) {

                var pesoLocal = target.posicao
                var aDepositar = ((pesoLocal / somaPosicaoAtivo) * valor)

                var somaDep = (await this.getTotal(target));

                if (somaDep == null) {

                    if (aDepositar >= target.valor) {
                        var diferenca = aDepositar - target.valor

                        aDepositar = target.valor

                        target.ativo = false
                        await target.save()

                        targets.pop()

                        valorResto += diferenca
                    }
                } else {
                    var valorAposODeposito = Number(somaDep) + Number(aDepositar)

                    if (valorAposODeposito >= target.valor) {

                        var diferenca = valorAposODeposito - target.valor
                        aDepositar = target.valor - somaDep

                        target.ativo = false
                        await target.save()

                        valorResto += diferenca
                    }
                }

                var deposit = await Deposit.create({
                    targetId: target.id,
                    valor: aDepositar
                });


                resposta.push(deposit)
            }

            if (valorResto <= 0.1) {
                break;
            }
            valor = valorResto;
        }

        return resposta
    }

    public async inside({ auth, request, response }: HttpContext ) {

        const userAuth = await auth.getUserOrFail()
        const data = request.all()
        const payload = await historicValidator.validate(data)

        var valor = payload.valor;

        logger.info(`user: ${userAuth.id}, inside valor: ${valor}`)

        var somaPosicaoAtivo = (await db
            .from('targets')
            .sum('posicao as soma')
            .where('user_id',userAuth.id)
            .where('ativo', 1)).at(0).soma

        logger.info(`soma das posicoes: ${somaPosicaoAtivo}`)

        if (somaPosicaoAtivo === null) {
            return response.methodNotAllowed('Não há targets salvos');
        }

        somaPosicaoAtivo = parseInt(somaPosicaoAtivo)

        if (somaPosicaoAtivo === 0) {
            return response.methodNotAllowed('Os targets não estão classificados');
        }

        var resposta = HistoricsController.processDeposit(valor, userAuth.id)

        return response.ok(resposta)
    }

    public static async getTotal(target: Target) {

        logger.info("getTotal("+target.id+")")

        var somaDeposits = (await db
            .from('deposits')
            .sum('valor as soma')
            .where('target_id', target.id)).at(0).soma

        return somaDeposits as number

    }
}