import Target from '#models/target'
import logger from '@adonisjs/core/services/logger'
import PriceAgentService from '#services/price_agent_service'

/**
 * Roda a checagem de preço para todos os targets ativos com URL válida.
 * Usado tanto pelo comando manual (`node ace check:product-prices`)
 * quanto pelo agendador automático (`start/scheduler.ts`).
 */
export async function runPriceCheck() {
  logger.info('[PriceCheck] iniciando checagem de preços')

  const products = await Target.all()

  for (const product of products) {
    const url = product.url

    if (!url?.includes('http') || product.ativo !== true) {
      logger.info(`O produto: ${product.descricao} não tem URL válida ou não está ativo`)
      continue
    }

    logger.info(`O produto: ${product.descricao} tem a URL: ${url}`)

    try {
      const result = await PriceAgentService.getPrice(url, product.descricao)

      if (result.price === null) {
        logger.warn(`Não foi possível obter o preço de "${product.descricao}" (${result.domain})`)
        continue
      }

      logger.info(
        `[${result.strategy}] "${product.descricao}" -> R$ ${result.price} (era R$ ${product.valor})`
      )

      if (result.price !== product.valor) {
        product.valor = result.price
        await product.save()
        logger.info(`Produto atualizado: ${url} - Novo valor: R$ ${result.price}`)
      }
    } catch (error) {
      logger.error(`Erro ao checar preço de "${product.descricao}": ${error.message}`)
    }
  }

  logger.info('[PriceCheck] checagem de preços finalizada')
}
