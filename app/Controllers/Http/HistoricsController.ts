import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Historic from 'App/Models/Historic';
import Logger from '@ioc:Adonis/Core/Logger';
import HistoricValidator from 'App/Validators/HistoricValidator';
import Target from 'App/Models/Target';
import Database from '@ioc:Adonis/Lucid/Database';
import Deposit from 'App/Models/Deposit';

export default class HistoricsController {

    public async get({ auth, response }: HttpContextContract) {

        const userAuth = await auth.use('api').authenticate()

        const historics = await Historic.query()
            .where('user_id', userAuth.id)
            .orderBy('created_at', 'desc');


        Logger.info('historic: ' + historics.toString())

        return response.ok(historics)
    }

    public static async processDeposit(valor: number, userId: number) {
        
        var somaPosicaoAtivo = (await Database
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

    public async inside({ auth, request, response }: HttpContextContract) {

        const userAuth = await auth.use('api').authenticate()
        const payload = await request.validate(HistoricValidator)

        var valor = payload.valor;

        var somaPosicaoAtivo = (await Database
            .query()
            .from('targets')
            .where('user_id', userAuth.id)
            .where('ativo', '1')
            .sum('posicao', 'soma')).at(0).soma

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

        Logger.info("getTotal("+target.id+")")
        var somaDeposits = (await Database
            .query()
            .from('deposits')
            .where('target_id', target.id)
            .sum('valor', 'soma')).at(0).soma

        return somaDeposits as number

    }
}


