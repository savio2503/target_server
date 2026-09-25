import Target from '#models/target'
import type { HttpContext } from '@adonisjs/core/http'
import HistoricsController from './historics_controller.js'
import ExchangeRateService from '#services/exchange_rate_service'
import logger from '@adonisjs/core/services/logger';
import { createEditTargetValidator } from '#validators/create_edit_target'
import Deposit from '#models/deposit';
//import { editImageValidator } from '#validators/image';
import ImagemTarget from '#models/imagem_target';
import ImageConverter from '../helpers/ImageConverter.js';
import db from '@adonisjs/lucid/services/db'
import Lastupdate from '#models/lastupdate';
import { DateTime } from 'luxon';
import Historic from '#models/historic';
import TargetAllCacheService from '#services/target_all_cache_service'

export default class TargetsController {

    public async all({ request, response, auth, params }: HttpContext) {
        const user = await auth.getUserOrFail()
        logger.info(
            `[TargetAll] request=${request.method()} url=${request.url()} userId=${user.id} order=${params.order}`
        )
        const result = await TargetAllCacheService.get(user.id, Number(params.order))
        logger.info(
            `[TargetAll] resposta get_all userId=${user.id} order=${params.order} items=${result.length}`
        )

        return response.ok(result)
    }

    private async getPorcetagemDolar(valorTotal: number, valorDepositado: number) {
        const valorDolar = await ExchangeRateService.getUsdBrlRate()
        const taxa = valorDolar * 0.02
        const iof = (valorDolar + taxa) * 0.011
        const dollarNomad = valorDolar + taxa + iof
        const depositEmDolar = valorDepositado / dollarNomad

        return ((depositEmDolar * 100) / valorTotal)
    }

    public async store({ request, response, auth }: HttpContext) {


        try {
            
            logger.info(`chamou o criar target`)

            const data = request.all()
            //logger.info(`start 1 ${data}`)
            const payload = await createEditTargetValidator.validate(data)
            //logger.info(`start 2`)
            const user = await auth.getUserOrFail();

            //logger.info(`get user`)

            const target = await Target.create({
                userId: user.id,
                descricao: payload.descricao,
                valor: payload.valor,
                posicao: payload.posicao,
                coinId: payload.coin,
                //imagem: payload.imagem,
                removebackground: payload.removebackground,
                comprado: payload.comprado == 1,
                url: payload.url,
                ativo: payload.ativo == 1
            })

            //logger.info(`criou o target = ${target.id}`)

            if (payload.imagem != null) {

                var imagemBase64 = payload.imagem

                if (payload.imagem && ImageConverter.isURL(payload.imagem)) {
                    try {
                        imagemBase64 = await ImageConverter.convertUrlToBase64(payload.imagem);
                    } catch (error) {
                        logger.info(`erro ao baixar a imagem base64 ${error}`);
                        imagemBase64 = payload.imagem
                    }
                }

                await ImagemTarget.create({
                    idTarget: target.id,
                    imagem: imagemBase64
                })

                await Lastupdate.create({
                    table: 'imagem',
                    action: 'create',
                    detail: target.id.toString(),
                    dateUpdate: DateTime.now(),
                    user: user.id
                })

                //logger.info(`criou a imagem = ${imagem.id}`)
            } 

            await Lastupdate.create({
                table: 'targets',
                action: 'create',
                detail: target.id.toString(),
                dateUpdate: DateTime.now(),
                user: user.id
            })

            await TargetAllCacheService.markUserStale(user.id)

            return response.ok({
                "id": target.id,
                "descricao": target.descricao,
                "valor": target.valor,
                "posicao": target.posicao,
                "coin": target.coinId,
                //"imagem": target.imagem,
                "removebackground": target.removebackground,
                "comprado": target.comprado ? 1 : 0,
                "url": target.url,
                "ativo": target.ativo ? 1 : 0
            })
        } catch (error) {
            logger.error(`Validation erro: ${error.message}`)
            return response.status(502).send({
                message: 'validation error',
                error: error.message
            })
        }
    }

    public async update({ request, response, params }: HttpContext) {

        const data = request.all()
        const payload = await createEditTargetValidator.validate(data)
        const target = await Target.findOrFail(params.id);

        var _ativo = target.ativo;

        if (payload.ativo != null) {
            _ativo = payload.ativo == 1;
        }
        logger.info(`chamou o update target ${target.id}`)

        target.merge({
            descricao: payload.descricao,
            valor: payload.valor,
            posicao: payload.posicao,
            coinId: payload.coin,
            //imagem: payload.imagem,
            removebackground: payload.removebackground,
            url: payload.url ?? null,
            ativo: _ativo,
        });
        await target.save();

        logger.info(`update target imagem = ${payload.imagem != null ? payload.imagem.substring(0, 10) : 'imagem nula'}`)

        if (payload.imagem != null) {

            const imagem = await ImagemTarget.query()
                .where('idTarget', target.id)
                .first()

            var imagemBase64 = payload.imagem

            if (payload.imagem && ImageConverter.isURL(payload.imagem)) {
                try {
                    imagemBase64 = await ImageConverter.convertUrlToBase64(payload.imagem);
                } catch (error) {
                    logger.info(`erro ao baixar a imagem base64 ${error}`);
                    imagemBase64 = payload.imagem
                }
            }

            if (imagem != null) {

                imagem.merge({
                    imagem: imagemBase64
                })
                await imagem.save()
            } else {

                await ImagemTarget.create({
                    idTarget: target.id,
                    imagem: imagemBase64
                })

            }

            await Lastupdate.create({
                        table: 'imagem',
                        action: 'update',
                        detail: target.id.toString(),
                        dateUpdate: DateTime.now(),
                        user: target?.userId
                    })

            //logger.info(`update a imagem = ${imagem.id}`)
        } /*else {
            logger.info(`imagem nula update`)
        }*/

        await Lastupdate.create({
            table: 'targets',
            action: 'update',
            detail: target.id.toString(),
            dateUpdate: DateTime.now(),
            user: target.userId
        })

        await TargetAllCacheService.markUserStale(target.userId)

        logger.info(`update target ${target.id} completed`)

        return response.ok({
            "id": target.id,
            "descricao": target.descricao,
            "valor": target.valor,
            "posicao": target.posicao,
            "coin": target.coinId,
            //"imagem": target.imagem,
            "removebackground": target.removebackground,
			"url": target.url,
        })
    }

    public async comprar({ auth, response, params }: HttpContext) {

        const target = await Target.findOrFail(params.id)
        const compradoparam = params.comprado
        const valorCompra = params.valorCompra
        logger.info(`chamou o comprar para target ${target.id}`)

        if (valorCompra != null && valorCompra > 0) {

            const userAuth = await auth.getUserOrFail()

            //modificando o target
            target.merge({
                valor: valorCompra,
                comprado: compradoparam,
                ativo: false
            })

            await target.save();
            //retirando ou adicionando o valor do historico

            let totalDeposit = Number(await HistoricsController.getTotal(target))
            let diffToTarget = valorCompra - totalDeposit
            let diffToOuthers = -1 * diffToTarget

            logger.info(`target.id: ${target.id}, valorCompra: ${valorCompra}, totalDeposit: ${totalDeposit}, diffToTarget: ${diffToTarget}, diffToOuthers: ${diffToOuthers}`)

            await Deposit.create({
                    targetId: target.id,
                    valor: diffToTarget
                });
            //fim historico

            var valor = diffToOuthers;

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

            await HistoricsController.processDeposit(valor, userAuth.id)

            logger.info('saveDeposit: ' + valor + ', user: ' + userAuth.id)

            await Historic.create({
                valor: valor,
                userId: userAuth.id
            });
            
            await Lastupdate.create({
                table: 'targets',
                action: 'all',
                dateUpdate: DateTime.now(),
            })

        } else {
            target.merge({
                comprado: compradoparam,
                ativo: false
            })

            await target.save();
        }

        await Lastupdate.create({
            table: 'targets',
            action: 'all',
            detail: target.id.toString(),
            dateUpdate: DateTime.now(),
            user: target.userId
        })

        await TargetAllCacheService.markUserStale(target.userId)

        return response.ok({
            "id": target.id,
            "descricao": target.descricao,
            "valor": target.valor,
            "posicao": target.posicao,
            "coin": target.coinId,
            //"imagem": target.imagem,
            "removebackground": target.removebackground,
            "comprado": target.comprado
        })
    }

    public async destroy({ auth, response, params }: HttpContext) {
        try {
            var target = await Target.query().where('id', params.id)

            var userid = target[0].userId

            if (target.length < 1) {
                return response.notFound();
            }
            logger.info(`chamou o destroy target ${target[0].id}`)

            var total = await HistoricsController.getTotal(target[0])

            await Deposit.query().where('target_id', target[0].id).delete();

            await target[0].delete();

            const userAuth = await auth.getUserOrFail()

            await HistoricsController.processDeposit(total, userAuth.id)

            await Lastupdate.create({
                table: 'targets',
                action: 'all',
                detail: params.id.toString(),
                dateUpdate: DateTime.now(),
                user: userid
            })

            await TargetAllCacheService.markUserStale(userid)

            return response.ok(`target ${params.id} deleted successfully`);
        } catch (error) {
            return response.badRequest();
        }
    }

    public async index({ response, params }: HttpContext) {
        const target = await Target.findOrFail(params.id)

        target.totalDeposit = Number(await HistoricsController.getTotal(target))
        target.valor = Number(target.valor)

        if (target.coinId != 1) {
            target.porcetagem = await this.getPorcetagemDolar(target.valor, target.totalDeposit)
        } else {
            target.porcetagem = ((target.totalDeposit * 100) / target.valor)
        }

        return response.ok({
            "id": target.id,
            "descricao": target.descricao,
            "valor": target.valor,
            "posicao": target.posicao,
            "ativo": target.ativo,
            "coin": target.coinId,
            "total": target.totalDeposit,
            "porcentagem": target.porcetagem,
            "removebackground": target.removebackground,
            "comprado": target.comprado,
            "url": target.url
        })
    }

    /*public async image({ response, params }: HttpContext) {

        const target = await Target.findOrFail(params.id);

        return response.ok({
            "imagem": target.imagem
        })
    }*/
}
