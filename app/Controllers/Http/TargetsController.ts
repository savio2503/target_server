import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Target from 'App/Models/Target';
import Logger from '@ioc:Adonis/Core/Logger';
import User from 'App/Models/User';
import CreateEditTargetValidator from 'App/Validators/CreateEditTargetValidator';
import HistoricsController from './HistoricsController';
import Deposit from 'App/Models/Deposit';

export default class TargetsController {

    public async all({ response, auth }: HttpContextContract) {

        const userAuth = await auth.use('api').authenticate();
        const targets = await Target.query()
            .where('user_id', userAuth.id)
            .orderBy('posicao', 'desc');

        for await (const target of targets) {

            target.totalDeposit = Number(await HistoricsController.getTotal(target))
            target.valor = Number(target.valor)

            if (target.coinId != 1) {
                target.porcetagem = await this.getPorcetagemDolar(target.valor, target.totalDeposit)
            } else {
                target.porcetagem = ((target.totalDeposit * 100) / target.valor)
            }

        }

        return response.ok(targets);
    }

    public async allAtive({ response, auth }: HttpContextContract) {
        const userAuth = await auth.use('api').authenticate();
        const targets = await Target.query()
            .where('user_id', userAuth.id)
            .where('ativo', true)
            .orderBy('posicao', 'desc');

        for await (const target of targets) {

            target.totalDeposit = Number(await HistoricsController.getTotal(target))
            target.valor = Number(target.valor)

            if (target.coinId != 1) {
                target.porcetagem = await this.getPorcetagemDolar(target.valor, target.totalDeposit)
            } else {
                target.porcetagem = ((target.totalDeposit * 100) / target.valor)
            }
        }

        return response.ok(targets);
    }

    private async getPorcetagemDolar(valorTotal: number, valorDepositado: number) {

        let url = 'https://economia.awesomeapi.com.br/last/USD-BRL';

        var res = await fetch(url)
        .then(res => res.text())
        .then(obj => JSON.parse(obj))
        .catch(err => { throw err });

        Logger.info(`-> ${res.USDBRL.bid}`)
        var valorDolar = Number(res.USDBRL.bid)
        var taxa = valorDolar * 0.02
        var iof = (valorDolar + taxa) * 0.011
        var dollarNomad = valorDolar + taxa + iof;
        var depositEmDolar = (valorDepositado) / dollarNomad;

        Logger.info(`valor total -> ${valorDepositado}
            , valorDolar -> ${valorDolar}
            , taxa -> ${taxa}
            , iof -> ${iof}
            , dollarNomad -> ${dollarNomad}
            , em dolar -> ${depositEmDolar}`)

        return ((depositEmDolar  * 100) / valorTotal)
    }

    public async store({ request, response, auth }: HttpContextContract) {

        const payload = await request.validate(CreateEditTargetValidator);
        const userAuth = await auth.use('api').authenticate();
        const user = await User.findByOrFail('id', userAuth.id);

        const target = await Target.create({
            userId: user.id,
            descricao: payload.descricao,
            valor: payload.valor,
            posicao: payload.posicao,
            coinId: payload.coin,
            imagem: payload.imagem,
        })

        return response.ok(target)
    }

    public async index({ response, params }: HttpContextContract) {

        const target = await Target.findOrFail(params.id);

        return response.ok(target);
    }

    public async image({ response, params }: HttpContextContract) {

        const target = await Target.findOrFail(params.id);

        return response.ok(target.imagem);
    }

    public async update({ request, response, params }: HttpContextContract) {
        const payload = await request.validate(CreateEditTargetValidator);
        const target = await Target.findOrFail(params.id);

        target.merge({
            descricao: payload.descricao,
            valor: payload.valor,
            posicao: payload.posicao,
            coinId: payload.coin,
            imagem: payload.imagem
        });
        await target.save();

        return response.ok(target)
    }

    public async destroy({ auth, response, params }: HttpContextContract) {
        try {
            var target = await Target.query().where('id', params.id)

            if (target.length < 1) {
                return response.notFound();
            }

            var total = await HistoricsController.getTotal(target[0])

            await Deposit.query().where('target_id', target[0].id).delete();

            await target[0].delete();

            const userAuth = await auth.use('api').authenticate()

            await HistoricsController.processDeposit(total, userAuth.id)

            return response.ok(`target ${params.id} deleted successfully`);
        } catch (error) {
            return response.badRequest();
        }
    }
}
