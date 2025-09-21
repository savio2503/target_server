import Target from '#models/target'
import type { HttpContext } from '@adonisjs/core/http'
import HistoricsController from './historics_controller.js'
import logger from '@adonisjs/core/services/logger';
import { createEditTargetValidator } from '#validators/create_edit_target'
import Deposit from '#models/deposit';
//import { editImageValidator } from '#validators/image';
import ImagemTarget from '#models/imagem_target';
import ImageConverter from '../helpers/ImageConverter.js';
import { Database } from '@adonisjs/lucid/database';
import Lastupdate from '#models/lastupdate';
import { DateTime } from 'luxon';

export default class TargetsController {

    public async all({ response, auth, params }: HttpContext) {

    //logger.info("target all")

        const user = await auth.getUserOrFail()
        const targets = await Target.query()
            .where('user_id', user.id)
            .orderBy('posicao', 'desc')
        var result = []
        var order = params.order

        logger.info(`all target order: ${order}`)

        if (order == null) {
            order = 1
            logger.info(`all target order nulo: ${order}`)
        }

        for await (const target of targets) {

            target.totalDeposit = Number(await HistoricsController.getTotal(target))
            target.valor = Number(target.valor)

            if (target.coinId != 1) {
                target.porcetagem = await this.getPorcetagemDolar(target.valor, target.totalDeposit)
            } else {
                target.porcetagem = ((target.totalDeposit * 100) / target.valor)
            }

            //if (target.ativo)
            //    logger.info(`target[${target.id}] = ${target.totalDeposit}, porc: ${target.porcetagem}`)

            result.push({
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
                "url": target.url,
            })
        }

        //order == percetagem
        if (order == 0) {
            result.sort((a, b) => {
                return b.porcentagem - a.porcentagem
            })
        } else if (order == 1) {
            result.sort((a,b) => a.descricao.localeCompare(b.descricao, 'pt-BR', {sensitivity: "base"}))
        } else if (order == 2) {
            result.sort((a, b) => {
                if (a.posicao == b.posicao) {
                    return b.porcentagem - a.porcentagem
                } else {
                    return b.posicao - a.posicao
                }
            })
        } 

        //logger.info(`${JSON.stringify(result, null, 2)}`)

        return response.ok(result)
    }

    private async getPorcetagemDolar(valorTotal: number, valorDepositado: number) {

        /*let url = 'https://economia.awesomeapi.com.br/last/USD-BRL';

        var res = await fetch(url)
            .then(res => res.text())
            .then(obj => JSON.parse(obj))
            .catch(err => { throw err });

        //logger.info(`-> ${res.USDBRL.bid}`)
        var valorDolar = Number(res.USDBRL.bid)*/
        var valorDolar = 5.52
        var taxa = valorDolar * 0.02
        var iof = (valorDolar + taxa) * 0.011
        var dollarNomad = valorDolar + taxa + iof;
        var depositEmDolar = (valorDepositado) / dollarNomad;

        /*Logger.info(`valor total -> ${valorDepositado}
            , valorDolar -> ${valorDolar}
            , taxa -> ${taxa}
            , iof -> ${iof}
            , dollarNomad -> ${dollarNomad}
            , em dolar -> ${depositEmDolar}`)*/

        return ((depositEmDolar * 100) / valorTotal)
    }

    public async store({ request, response, auth }: HttpContext) {


        try {
            //logger.info(`start store`)

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

                //logger.info(`criou a imagem = ${imagem.id}`)
            } 

            await Lastupdate.create({
                table: 'targets',
                action: 'create',
                detail: target.id.toString(),
                dateUpdate: DateTime.now(),
                user: user.id
            })


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

        //logger.info(`update target = ${target.id}`)

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

    public async comprar({ response, params }: HttpContext) {

        const target = await Target.findOrFail(params.id)
        const compradoparam = params.comprado

        target.merge({
            comprado: compradoparam
        })
        await target.save();

        await Lastupdate.create({
            table: 'targets',
            action: 'all',
            detail: target.id.toString(),
            dateUpdate: DateTime.now(),
            user: target.userId
        })

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

            return response.ok(`target ${params.id} deleted successfully`);
        } catch (error) {
            return response.badRequest();
        }
    }

    public async index({ response, params }: HttpContext) {
        const target = await Target.findOrFail(params.id)

        return response.ok({
            "id": target.id,
            "descricao": target.descricao,
            "valor": target.valor,
            "posicao": target.posicao,
            "coin": target.coinId,
            //"imagem": target.imagem
        })
    }

    /*public async image({ response, params }: HttpContext) {

        const target = await Target.findOrFail(params.id);

        return response.ok({
            "imagem": target.imagem
        })
    }*/
}
