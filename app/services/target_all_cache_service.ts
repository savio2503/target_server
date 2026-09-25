import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import HistoricsController from '#controllers/historics_controller'
import ExchangeRateService from '#services/exchange_rate_service'
import Target from '#models/target'
import TargetAllCache from '#models/target_all_cache'
import User from '#models/user'

const SUPPORTED_ORDERS = [0, 1, 2]

type TargetAllItem = {
  id: number
  descricao: string
  valor: number
  posicao: number
  ativo: boolean
  coin: number
  total: number
  porcentagem: number
  removebackground: number
  comprado: boolean
  url: string | null | undefined
}

export default class TargetAllCacheService {
  private static inFlight = new Map<string, Promise<TargetAllItem[]>>()

  static async get(userId: number, requestedOrder: number) {
    const order = this.normalizeOrder(requestedOrder)
    logger.info(
      `[TargetAll] iniciando pesquisa userId=${userId} requestedOrder=${requestedOrder} normalizedOrder=${order}`
    )
    const cache = await TargetAllCache.query()
      .where('user_id', userId)
      .where('order', order)
      .first()

    if (cache && !cache.isStale) {
      logger.info(`[TargetAll] get_all_usuario userId=${userId} order=${order} origem=SERVER_CACHE`)
      return JSON.parse(cache.result) as TargetAllItem[]
    }

    logger.info(`[TargetAll] get_all_usuario userId=${userId} order=${order} origem=DATABASE`)
    const result = await this.queryAndSave(userId, order)
    logger.info(
      `[TargetAll] get_all_usuario userId=${userId} order=${order} origem=DATABASE items=${result.length}`
    )

    void this.refreshOtherOrders(userId, order)
    return result
  }

  static async refreshAllUsers() {
    const users = await User.query().select('id')
    logger.info(`[TargetAllCache] iniciando atualização para ${users.length} usuários`)

    for (const user of users) {
      for (const order of SUPPORTED_ORDERS) {
        try {
          logger.info(`[TargetAllCache] pesquisando userId=${user.id} order=${order}`)
          await this.queryAndSave(user.id, order)
        } catch (error) {
          logger.error(
            `[TargetAllCache] falha ao atualizar usuário ${user.id}, ordem ${order}:`,
            error
          )
        }
      }
    }
  }

  private static async queryAndSave(userId: number, order: number) {
    const key = `${userId}:${order}`
    const running = this.inFlight.get(key)

    if (running) {
      logger.info(`[TargetAllCache] pesquisa já em andamento userId=${userId} order=${order}`)
      return running
    }

    const operation = (async () => {
      const result = await this.queryDatabase(userId, order)
      const capturedAt = DateTime.now()

      await TargetAllCache.updateOrCreate(
        { userId, order },
        { result: JSON.stringify(result), capturedAt, isStale: false }
      )
      logger.info(
        `[TargetAllCache] resultado salvo userId=${userId} order=${order} items=${result.length} capturedAt=${capturedAt.toISO()}`
      )

      return result
    })()

    this.inFlight.set(key, operation)
    void operation.then(
      () => this.inFlight.delete(key),
      () => this.inFlight.delete(key)
    )
    return operation
  }

  static async markUserStale(userId: number) {
    const updated = await TargetAllCache.query()
      .where('user_id', userId)
      .update({ isStale: true })
    logger.info(`[TargetAllCache] cache marcado como stale userId=${userId} registros=${updated}`)
  }

  private static async refreshOtherOrders(userId: number, requestedOrder: number) {
    const otherOrders = SUPPORTED_ORDERS.filter((order) => order !== requestedOrder)
    logger.info(
      `[TargetAllCache] atualização em background userId=${userId} orders=${otherOrders.join(',')}`
    )

    await Promise.all(
      otherOrders.map(async (order) => {
        try {
          await this.queryAndSave(userId, order)
        } catch (error) {
          logger.error(
            `[TargetAllCache] falha no background userId=${userId} order=${order}:`,
            error
          )
        }
      })
    )
  }

  private static async queryDatabase(userId: number, order: number): Promise<TargetAllItem[]> {
    const targets = await Target.query().where('user_id', userId).orderBy('posicao', 'desc')
    const result: TargetAllItem[] = []

    for (const target of targets) {
      const totalDeposit = Number(await HistoricsController.getTotal(target))
      const valor = Number(target.valor)
      const porcentagem =
        target.coinId !== 1
          ? await this.getPorcentagemDolar(valor, totalDeposit)
          : (totalDeposit * 100) / valor

      result.push({
        id: target.id,
        descricao: target.descricao,
        valor,
        posicao: target.posicao,
        ativo: target.ativo,
        coin: target.coinId,
        total: totalDeposit,
        porcentagem,
        removebackground: target.removebackground,
        comprado: target.comprado,
        url: target.url,
      })
    }

    if (order === 0) {
      result.sort((a, b) => b.porcentagem - a.porcentagem)
    } else if (order === 1) {
      result.sort((a, b) =>
        a.descricao.localeCompare(b.descricao, 'pt-BR', { sensitivity: 'base' })
      )
    } else {
      result.sort((a, b) =>
        a.posicao === b.posicao ? b.porcentagem - a.porcentagem : b.posicao - a.posicao
      )
    }

    return result
  }

  private static async getPorcentagemDolar(valor: number, valorDepositado: number) {
    const valorDolar = await ExchangeRateService.getUsdBrlRate()
    const taxa = valorDolar * 0.02
    const iof = (valorDolar + taxa) * 0.011
    const dollarNomad = valorDolar + taxa + iof
    const depositEmDolar = valorDepositado / dollarNomad

    return (depositEmDolar * 100) / valor
  }

  private static normalizeOrder(order: number) {
    return SUPPORTED_ORDERS.includes(order) ? order : 1
  }

}
