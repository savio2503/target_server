import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import HistoricsController from '#controllers/historics_controller'
import ExchangeRateService from '#services/exchange_rate_service'
import Target from '#models/target'
import TargetAllCache from '#models/target_all_cache'
import User from '#models/user'
import Lastupdate from '#models/lastupdate'

const SUPPORTED_ORDERS = [0, 1, 2]

export type TargetAllItem = {
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

  // Cache em background: espera um tempo sem novas mudanças antes de recalcular
  // (uma operação dispara várias mudanças seguidas, ex.: depósito distribuído).
  private static readonly BACKGROUND_REFRESH_DELAY_MS = 3000
  private static refreshTimers = new Map<number, ReturnType<typeof setTimeout>>()
  private static refreshing = new Set<number>()
  private static refreshAgain = new Set<number>()

  // Incrementa a cada mudança do usuário. Se mudar durante um cálculo, o resultado
  // é gravado como stale em vez de "fresco" com dados já desatualizados.
  private static versions = new Map<number, number>()

  private static versionOf(userId: number) {
    return this.versions.get(userId) ?? 0
  }

  // Usuários que estão usando o since em vez do getall. Só para eles o cache dos
  // 3 filtros é recalculado em background, já que nenhum getall vai renová-lo.
  // Quem usa getall continua com o fluxo antigo (stale + recálculo no próximo getall).
  // Em memória: após restart do servidor o usuário volta a ser registrado na próxima chamada de since.
  private static readonly SINCE_USER_TTL_MS = 24 * 60 * 60 * 1000
  private static sinceUsers = new Map<number, number>()

  private static isSinceUser(userId: number) {
    const lastSeen = this.sinceUsers.get(userId)
    if (lastSeen === undefined) return false

    if (Date.now() - lastSeen > this.SINCE_USER_TTL_MS) {
      this.sinceUsers.delete(userId)
      return false
    }
    return true
  }

  /**
   * Chamado a cada requisição de since. Na primeira vez (ou após expirar), se o
   * cache dos 3 filtros não estiver completo e atualizado, agenda o recálculo em background.
   */
  static async registerSinceUser(userId: number) {
    try {
      const wasActive = this.isSinceUser(userId)
      this.sinceUsers.set(userId, Date.now())

      if (wasActive) return

      const fresh = await TargetAllCache.query()
        .where('user_id', userId)
        .where('is_stale', false)
        .select('id')

      if (fresh.length < SUPPORTED_ORDERS.length) {
        this.scheduleBackgroundRefresh(userId)
      }
    } catch (error) {
      logger.error(`[TargetAllCache] falha ao registrar usuário do since userId=${userId}:`, error)
    }
  }

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

  /**
   * Fluxo SINCE (independente do getall: não usa cache nem queryDatabase).
   *
   * 1. Lê a tabela lastupdates (user + table 'targets' + date_update > since).
   * 2. Calcula SOMENTE os targets citados em `detail` (um SUM por target alterado).
   * 3. Targets citados que não existem mais são devolvidos em `deletedIds`.
   *
   * O app aplica o delta na lista local e reordena conforme o filtro.
   */
  static async getUpdatedSince(userId: number, since: DateTime) {
    const startedAt = Date.now()

    const updates = await Lastupdate.query()
      .where('user', userId)
      .where('table', 'targets')
      .where('date_update', '>', since.toSQL()!)

    const ids = [
      ...new Set(
        updates
          .map((u) => Number(u.detail))
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ]

    if (ids.length === 0) {
      logger.info(`[TargetSince] userId=${userId} since=${since.toISO()} sem alterações`)
      return { targets: [] as TargetAllItem[], deletedIds: [] as number[] }
    }

    const found = await Target.query().where('user_id', userId).whereIn('id', ids)
    const foundIds = new Set(found.map((target) => target.id))
    const deletedIds = ids.filter((id) => !foundIds.has(id))

    const targets: TargetAllItem[] = []

    for (const target of found) {
      const totalDeposit = Number(await HistoricsController.getTotal(target))
      const valor = Number(target.valor)
      const porcentagem =
        target.coinId !== 1
          ? await this.getPorcentagemDolar(valor, totalDeposit)
          : (totalDeposit * 100) / valor

      targets.push({
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

    logger.info(
      `[TargetSince] userId=${userId} since=${since.toISO()} updates=${updates.length} atualizados=${targets.length} removidos=${deletedIds.length} tempo=${Date.now() - startedAt}ms`
    )

    return { targets, deletedIds }
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
      const versionBefore = this.versionOf(userId)
      const result = await this.queryDatabase(userId, order)
      const capturedAt = DateTime.now()
      const changedDuringQuery = this.versionOf(userId) !== versionBefore

      await TargetAllCache.updateOrCreate(
        { userId, order },
        { result: JSON.stringify(result), capturedAt, isStale: changedDuringQuery }
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
    this.versions.set(userId, this.versionOf(userId) + 1)

    const updated = await TargetAllCache.query()
      .where('user_id', userId)
      .update({ isStale: true })
    logger.info(`[TargetAllCache] cache marcado como stale userId=${userId} registros=${updated}`)

    if (this.isSinceUser(userId)) {
      this.scheduleBackgroundRefresh(userId)
    }
  }

  /**
   * Após mudanças (targets, históricos, depósitos) de um usuário que usa o since,
   * recalcula em background o cache dos 3 filtros, para que um getall posterior
   * já encontre o cache pronto.
   */
  static scheduleBackgroundRefresh(userId: number) {
    const pending = this.refreshTimers.get(userId)
    if (pending) {
      clearTimeout(pending)
    }

    const timer = setTimeout(() => {
      this.refreshTimers.delete(userId)
      void this.runBackgroundRefresh(userId)
    }, this.BACKGROUND_REFRESH_DELAY_MS)

    this.refreshTimers.set(userId, timer)
  }

  private static async runBackgroundRefresh(userId: number) {
    if (this.refreshing.has(userId)) {
      this.refreshAgain.add(userId)
      return
    }

    this.refreshing.add(userId)

    try {
      do {
        this.refreshAgain.delete(userId)
        logger.info(`[TargetAllCache] cache em background userId=${userId} orders=${SUPPORTED_ORDERS.join(',')}`)

        for (const order of SUPPORTED_ORDERS) {
          try {
            await this.queryAndSave(userId, order)
          } catch (error) {
            logger.error(
              `[TargetAllCache] falha no cache em background userId=${userId} order=${order}:`,
              error
            )
          }
        }
      } while (this.refreshAgain.has(userId))
    } finally {
      this.refreshing.delete(userId)
    }
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
