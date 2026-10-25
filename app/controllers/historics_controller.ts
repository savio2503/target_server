import Deposit from '#models/deposit';
import Historic from '#models/historic';
import Target from '#models/target';
import { historicValidator } from '#validators/historic';
import logger from '@adonisjs/core/services/logger';
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import ExchangeRateService from '#services/exchange_rate_service'
import Lastupdate from '#models/lastupdate';
import { DateTime } from 'luxon';
import TargetAllCacheService from '#services/target_all_cache_service'

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
        const valorDolar = await ExchangeRateService.getUsdBrlRate()
        const taxa = valorDolar * 0.02
        const iof = (valorDolar + taxa) * 0.011
        const dollarNomad = valorDolar + taxa + iof

        logger.info(`dolar: ${dollarNomad}`)

        return dollarNomad;
    }

    public static async processDeposit(valor: number, userId: number) {
        if (Math.abs(valor) < 0.001) {
            return []
        }

        const positivovalor = valor >= 0
        const valorDolar = await HistoricsController.getValorDolar()
        logger.info(`total: ${valor}`)

        let totalsMap = new Map<number, number>()
        let sums = await db
            .from('deposits')
            .join('targets', 'deposits.target_id', 'targets.id')
            .where('targets.user_id', userId)
            .select('deposits.target_id')
            .sum('deposits.valor as soma')
            .groupBy('deposits.target_id')

        for (let s of sums) {
            totalsMap.set(Number(s.target_id), Number(s.soma))
        }

        const allocatedMap = new Map<number, number>()
        const targetsToSave = new Set<Target>()
        const targetsById = new Map<number, Target>()
        const resposta: Deposit[] = []

        if (positivovalor) {
            const targets = await Target.query()
                .where('user_id', userId)
                .where('comprado', '0')
                .where('ativo', '1')

            if (targets.length === 0) {
                return []
            }

            for (const t of targets) {
                targetsById.set(t.id, t)
                allocatedMap.set(t.id, 0)
            }

            let remainingValor = valor

            while (remainingValor > 0.005) {
                const eligibleTargets = targets.filter((t) => {
                    const goalBrl = t.coinId === 1 ? Number(t.valor) : Number(t.valor) * valorDolar
                    const currentTotal = (totalsMap.get(t.id) || 0) + (allocatedMap.get(t.id) || 0)
                    return goalBrl - currentTotal > 0.005
                })

                if (eligibleTargets.length === 0) {
                    // Todas as metas ativas atingiram 100%. Distribui o excedente proporcionalmente entre todas as metas ativas.
                    const totalPesos = targets.reduce((acc, t) => acc + (t.posicao || 1), 0)
                    for (const target of targets) {
                        const peso = target.posicao || 1
                        const share = (peso / totalPesos) * remainingValor
                        allocatedMap.set(target.id, (allocatedMap.get(target.id) || 0) + share)
                    }
                    remainingValor = 0
                    break
                }

                const somaPesos = eligibleTargets.reduce((acc, t) => acc + (t.posicao || 1), 0)
                let allocatedThisRound = 0

                for (const target of eligibleTargets) {
                    const goalBrl = target.coinId === 1 ? Number(target.valor) : Number(target.valor) * valorDolar
                    const currentTotal = (totalsMap.get(target.id) || 0) + (allocatedMap.get(target.id) || 0)
                    const needed = Math.max(0, goalBrl - currentTotal)

                    const peso = target.posicao || 1
                    const share = (peso / somaPesos) * remainingValor
                    const toAllocate = Math.min(share, needed)

                    allocatedMap.set(target.id, (allocatedMap.get(target.id) || 0) + toAllocate)
                    allocatedThisRound += toAllocate

                    if (share >= needed - 0.005) {
                        target.ativo = false
                        targetsToSave.add(target)
                    }
                }

                const surplus = remainingValor - allocatedThisRound
                if (surplus <= 0.005 || allocatedThisRound <= 0.001) {
                    remainingValor = 0
                    break
                }
                remainingValor = surplus
            }

            // Ajuste de centavos residuais para garantir total exato
            let sumAllocated = 0
            for (const [id, amount] of allocatedMap.entries()) {
                const rounded = Math.round(amount * 100) / 100
                allocatedMap.set(id, rounded)
                sumAllocated += rounded
            }
            sumAllocated = Math.round(sumAllocated * 100) / 100

            const diffCents = Math.round((valor - sumAllocated) * 100) / 100
            if (Math.abs(diffCents) > 0.001) {
                const primaryTarget = [...targets].sort((a, b) => (b.posicao || 0) - (a.posicao || 0))[0]
                if (primaryTarget) {
                    const current = allocatedMap.get(primaryTarget.id) || 0
                    allocatedMap.set(primaryTarget.id, Math.round((current + diffCents) * 100) / 100)
                }
            }

            for (const target of targetsToSave) {
                await target.save()
            }
        } else {
            // Saque (valor negativo)
            let remainingWithdraw = Math.abs(valor)

            const targets = await Target.query()
                .where('user_id', userId)
                .where('comprado', '0')

            for (const t of targets) {
                targetsById.set(t.id, t)
                allocatedMap.set(t.id, 0)
            }

            while (remainingWithdraw > 0.005) {
                const eligibleTargets = targets.filter((t) => {
                    const currentTotal = (totalsMap.get(t.id) || 0) - (allocatedMap.get(t.id) || 0)
                    return currentTotal > 0.005
                })

                if (eligibleTargets.length === 0) {
                    break
                }

                const somaPesos = eligibleTargets.reduce((acc, t) => acc + (t.posicao || 1), 0)
                let withdrawnThisRound = 0

                for (const target of eligibleTargets) {
                    const currentTotal = (totalsMap.get(target.id) || 0) - (allocatedMap.get(target.id) || 0)
                    const peso = target.posicao || 1
                    const share = (peso / somaPesos) * remainingWithdraw
                    const toWithdraw = Math.min(share, currentTotal)

                    allocatedMap.set(target.id, (allocatedMap.get(target.id) || 0) + toWithdraw)
                    withdrawnThisRound += toWithdraw

                    const goalBrl = target.coinId === 1 ? Number(target.valor) : Number(target.valor) * valorDolar
                    const afterWithdraw = (totalsMap.get(target.id) || 0) - (allocatedMap.get(target.id) || 0)
                    if (!target.ativo && afterWithdraw < goalBrl - 0.005) {
                        target.ativo = true
                        targetsToSave.add(target)
                    }
                }

                const surplus = remainingWithdraw - withdrawnThisRound
                if (surplus <= 0.005 || withdrawnThisRound <= 0.001) {
                    remainingWithdraw = 0
                    break
                }
                remainingWithdraw = surplus
            }

            const targetTotalWithdraw = Math.abs(valor)
            let sumWithdrawn = 0
            for (const [id, amount] of allocatedMap.entries()) {
                const rounded = Math.round(amount * 100) / 100
                allocatedMap.set(id, rounded)
                sumWithdrawn += rounded
            }
            sumWithdrawn = Math.round(sumWithdrawn * 100) / 100

            const diffCents = Math.round((targetTotalWithdraw - sumWithdrawn) * 100) / 100
            if (Math.abs(diffCents) > 0.001) {
                const eligibleTargets = targets.filter(
                    (t) => (totalsMap.get(t.id) || 0) - (allocatedMap.get(t.id) || 0) >= diffCents
                )
                const primaryTarget = eligibleTargets.sort((a, b) => (b.posicao || 0) - (a.posicao || 0))[0]
                if (primaryTarget) {
                    const current = allocatedMap.get(primaryTarget.id) || 0
                    allocatedMap.set(primaryTarget.id, Math.round((current + diffCents) * 100) / 100)
                }
            }

            for (const [id, amount] of allocatedMap.entries()) {
                allocatedMap.set(id, -1 * amount)
            }

            for (const target of targetsToSave) {
                await target.save()
            }
        }

        const depositsToCreate: any[] = []
        const lastupdatesToCreate: any[] = []

        for (const [targetId, amount] of allocatedMap.entries()) {
            if (Math.abs(amount) >= 0.01) {
                const targetObj = targetsById.get(targetId)
                logger.info(`target ${targetObj?.descricao || targetId}: U$ ${amount}`)
                depositsToCreate.push({
                    targetId: targetId,
                    valor: amount,
                })
                lastupdatesToCreate.push({
                    table: 'targets',
                    action: 'update',
                    detail: targetId.toString(),
                    dateUpdate: DateTime.now(),
                    user: userId,
                })
            }
        }

        if (depositsToCreate.length > 0) {
            const createdDeposits = await Deposit.createMany(depositsToCreate)
            resposta.push(...createdDeposits)
        }
        if (lastupdatesToCreate.length > 0) {
            await Lastupdate.createMany(lastupdatesToCreate)
        }

        logger.info(`------------------------`)

        await TargetAllCacheService.markUserStale(userId)
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
        
        await Lastupdate.create({
            table: 'targets',
            action: 'all',
            dateUpdate: DateTime.now(),
            user: userAuth.id,
        })

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
