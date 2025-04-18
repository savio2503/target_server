import Deposit from '#models/deposit';
import Historic from '#models/historic';
import Target from '#models/target';
import { historicValidator } from '#validators/historic';
import logger from '@adonisjs/core/services/logger';
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class HistoricsController {
    public async get({ auth, response }: HttpContext) {

        const userAuth = await auth.getUserOrFail()

        /*const historics = await Historic.query()
            .where('user_id', userAuth.id)
            .orderBy('created_at', 'desc');*/

        const historics = await db.from('historics')
            .select(db.rawQuery(`valor as valor, date_format(created_at, '%d/%m/%Y') as mes`))
            .where('user_id', userAuth.id)
            .orderByRaw(`created_at desc`)

        for (const historic of historics) {
            historic.valor = Number(historic.valor)
        }

        //logger.info('historic: ' + historics.toString())

        return response.ok(historics)
    }

    private static async getValorDolar() {
        let url = 'https://economia.awesomeapi.com.br/last/USD-BRL';

        var res = await fetch(url)
            .then(res => res.text())
            .then(obj => JSON.parse(obj))
            .catch(err => { throw err });

        //logger.info(`-> ${res.USDBRL.bid}`)
        var valorDolar = Number(res.USDBRL.bid)
        var taxa = valorDolar * 0.02
        var iof = (valorDolar + taxa) * 0.011
        var dollarNomad = valorDolar + taxa + iof;

        logger.info(`dolar: ${dollarNomad}`)

        return dollarNomad;
    }

    public static async processDeposit(valor: number, userId: number) {

        var somaPosicaoAtivo;
        let positivovalor = valor >= 0

        if (positivovalor) {
            somaPosicaoAtivo = (await db
                .query()
                .from('targets')
                .where('user_id', userId)
                .where('ativo', '1')
                .sum('posicao', 'soma')).at(0).soma
        } else {
            somaPosicaoAtivo = (await db
                .query()
                .from('targets')
                .where('user_id', userId)
                .where('comprado', '0')
                .sum('posicao', 'soma')).at(0).soma
        }

        somaPosicaoAtivo = parseInt(somaPosicaoAtivo)

        var resposta: Deposit[] = [];
        var valorResto: number = 0.0;
        var valorDolar: number = await HistoricsController.getValorDolar();

        logger.info(`total: ${valor}`)

        while (true) {
            valorResto = 0.0

            var targets
            if (positivovalor) {
                targets = await Target.query()
                    .where('user_id', userId)
                    .where('ativo', '1')
            } else {
                targets = await Target.query()
                    .where('user_id', userId)
                    .where('comprado', '0')
            }

            for await (const target of targets) {

                var pesoLocal = target.posicao
                var aDepositar = ((pesoLocal / somaPosicaoAtivo) * valor)

                var somaDep = (await this.getTotal(target));
                //logger.info(`a depositar ${aDepositar}`)
                logger.info(`------------------------`)

                if (target.coinId == 1) {
                    //logger.info(`real`)
                    if (somaDep == null) {
                        //logger.info(`if 1 ${aDepositar} / ${target.valor}`)
                        if (aDepositar >= target.valor) {
                            logger.info(`if 2`)
                            var diferenca = aDepositar - target.valor

                            aDepositar = target.valor

                            target.ativo = false
                            await target.save()

                            targets.pop()

                            valorResto += diferenca
                        }
                    } else {
                        var valorAposODeposito = Number(somaDep) + Number(aDepositar)
                        //logger.info(`if 3 ${valorAposODeposito} / ${target.valor}`)

                        if (valorAposODeposito >= target.valor) {
                            logger.info(`if 4`)
                            var diferenca = valorAposODeposito - target.valor
                            aDepositar = target.valor - somaDep

                            target.ativo = false
                            await target.save()

                            valorResto += diferenca
                        }

                        if (!positivovalor && !target.ativo) {
                            //logger.info(`voltando para ativo o target: ${target.id}`)
                            logger.info(`if 5`)
                            target.ativo = true
                            await target.save()
                        }
                    } 
                } else {
                    //logger.info(`dolar`)
                    var valorConvertido = target.valor * valorDolar

                    if (somaDep == null) {
                        //logger.info(`if 5 ${aDepositar} / ${valorConvertido}`)
                        if (aDepositar >= valorConvertido) {
                            logger.info(`if 6`)
                            var diferenca = aDepositar - target.valor

                            aDepositar = target.valor

                            target.ativo = false
                            await target.save()

                            targets.pop()

                            valorResto += diferenca
                        }
                    } else {
                        var valorAposODeposito = Number(somaDep) + Number(aDepositar)
                        //logger.info(`if 7 ${valorAposODeposito} / ${valorConvertido}`)
                        if (valorAposODeposito >= valorConvertido) {
                            logger.info(`if 8`)
                            var diferenca = valorAposODeposito - target.valor
                            aDepositar = target.valor - somaDep

                            target.ativo = false
                            await target.save()

                            valorResto += diferenca
                        }

                        if (!positivovalor && !target.ativo) {
                            //logger.info(`voltando para ativo o target: ${target.id}`)
                            logger.info(`if 9`)
                            target.ativo = true
                            await target.save()
                        }
                    }
                }

                logger.info(`target ${target.descricao}: U$ ${aDepositar}`)
                var deposit = await Deposit.create({
                    targetId: target.id,
                    valor: aDepositar
                });



                resposta.push(deposit)
            }
            logger.info(`------------------------`)

            if (valorResto <= 0.1) {
                break;
            }
            valor = valorResto;
        }

        return resposta
    }

    public async inside({ auth, request, response }: HttpContext) {

        const userAuth = await auth.getUserOrFail()
        const data = request.all()
        const payload = await historicValidator.validate(data)

        var valor = payload.valor;

        logger.info(`user: ${userAuth.id}, inside valor: ${valor}`)

        var somaPosicaoAtivo = (await db
            .from('targets')
            .sum('posicao as soma')
            .where('user_id', userAuth.id)
            .where('ativo', 1)).at(0).soma

        logger.info(`soma das posicoes: ${somaPosicaoAtivo}`)

        if (somaPosicaoAtivo === null) {
            return response.methodNotAllowed('Não há targets salvos');
        }

        somaPosicaoAtivo = parseInt(somaPosicaoAtivo)

        if (somaPosicaoAtivo === 0) {
            return response.methodNotAllowed('Os targets não estão classificados');
        }

        var resposta = await HistoricsController.processDeposit(valor, userAuth.id)

        await this.saveDeposit(valor, userAuth.id);

        return response.ok(resposta)
    }

    private async saveDeposit(valor: number, userId: number) {

        logger.info('saveDeposit: ' + valor + ', user: ' + userId)

        await Historic.create({
            valor: valor,
            userId: userId
        });

    }

    public static async getTotal(target: Target) {

        //logger.info("getTotal("+target.id+")")

        var somaDeposits = (await db
            .from('deposits')
            .sum('valor as soma')
            .where('target_id', target.id)).at(0).soma

        return somaDeposits as number

    }
}