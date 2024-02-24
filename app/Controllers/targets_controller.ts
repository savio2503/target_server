import Target from '#models/target'
import type { HttpContext } from '@adonisjs/core/http'
import HistoricsController from './historics_controller.js'
import logger from '@adonisjs/core/services/logger';
import { createEditTargetValidator } from '#validators/create_edit_target'

export default class TargetsController {

    public async all({ response, auth }: HttpContext) {

        logger.info("target all")

        const user = await auth.getUserOrFail()
        const targets = await Target.query()
            .where('user_id', user.id)
            .orderBy('posicao', 'desc')
        var result = []    

        for await (const target of targets) {

            target.totalDeposit = Number(await HistoricsController.getTotal(target))
            target.valor = Number(target.valor)

            if (target.coinId != 1) {
                target.porcetagem = await this.getPorcetagemDolar(target.valor, target.totalDeposit)
            } else {
                target.porcetagem = ((target.totalDeposit * 100) / target.valor)
            }

            result.push({
                "id": target.id,
                "descricao": target.descricao,
                "valor": target.valor,
                "posicao": target.posicao,
                "ativo": target.ativo,
                "coin": target.coinId,
                "imagem": target.imagem,
                "total": target.totalDeposit,
                "porcetagem": target.porcetagem 
            })
        }

        //logger.info(`${JSON.stringify(result, null, 2)}`)

        return response.ok(result)
    }

    private async getPorcetagemDolar(valorTotal: number, valorDepositado: number) {

        let url = 'https://economia.awesomeapi.com.br/last/USD-BRL';

        var res = await fetch(url)
        .then(res => res.text())
        .then(obj => JSON.parse(obj))
        .catch(err => { throw err });

        logger.info(`-> ${res.USDBRL.bid}`)
        var valorDolar = Number(res.USDBRL.bid)
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

        return ((depositEmDolar  * 100) / valorTotal)
    }

    public async store({ request, response, auth }: HttpContext) {

        const data = request.all()
        const payload = await createEditTargetValidator.validate(data)
        const user = await auth.getUserOrFail();

        const target = await Target.create({
            userId: user.id,
            descricao: payload.descricao,
            valor: payload.valor,
            posicao: payload.posicao,
            coinId: payload.coin,
            imagem: payload.imagem,
        })

        return response.ok({
            "id": target.id,
            "descricao": target.descricao,
            "valor": target.valor,
            "posicao": target.posicao,
            "coin": target.coinId,
            "imagem": target.imagem 
        })
    }

    public async index({ response, params }: HttpContext) {
        const target = await Target.findOrFail(params.id)

        return response.ok({
            "id": target.id,
            "descricao": target.descricao,
            "valor": target.valor,
            "posicao": target.posicao,
            "coin": target.coinId,
            "imagem": target.imagem 
        })
    }

    public async image({ response, params }: HttpContext) {

        const target = await Target.findOrFail(params.id);

        return response.ok({
            "imagem": target.imagem 
        })
    }
}