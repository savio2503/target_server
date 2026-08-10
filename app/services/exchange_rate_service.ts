import axios from 'axios'
import { DateTime } from 'luxon'
import ExchangeRate from '#models/exchange_rate'
import logger from '@adonisjs/core/services/logger'

const BASE_CURRENCY = 'USD'
const TARGET_CURRENCY = 'BRL'
const BCB_API_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados/ultimos/1'

function getPreviousBusinessDay(date: DateTime): DateTime {
  const weekday = date.weekday

  if (weekday === 1) {
    return date.minus({ days: 3 })
  }

  if (weekday === 7) {
    return date.minus({ days: 2 })
  }

  if (weekday === 6) {
    return date.minus({ days: 1 })
  }

  return date.minus({ days: 1 })
}

export default class ExchangeRateService {
  public static async getUsdBrlRate(): Promise<number> {
    const previousBusinessDay = getPreviousBusinessDay(DateTime.now()).toISODate()

    const latestCached = await ExchangeRate.query()
      .where('base_currency', BASE_CURRENCY)
      .where('target_currency', TARGET_CURRENCY)
      .orderBy('rate_date', 'desc')
      .first()

    if (latestCached && latestCached.rateDate && previousBusinessDay && latestCached.rateDate >= previousBusinessDay) {
      return Number(latestCached.rate)
    }

    const { rate, rateDate } = await this.fetchUsdBrlRate()

    try {
      await ExchangeRate.firstOrCreate(
        {
          baseCurrency: BASE_CURRENCY,
          targetCurrency: TARGET_CURRENCY,
          rateDate,
        },
        {
          baseCurrency: BASE_CURRENCY,
          targetCurrency: TARGET_CURRENCY,
          rateDate,
          rate,
        }
      )
    } catch (error: any) {
      logger.warn(`Falha ao gravar cotação de dólar em cache: ${error.message}`)
    }

    logger.info(`Cotação USD-BRL atualizada: ${rate} em ${rateDate}`)

    return rate
  }

  private static async fetchUsdBrlRate(): Promise<{ rate: number; rateDate: string }> {
    try {
      const response = await axios.get(BCB_API_URL, {
        params: { formato: 'json' },
        timeout: 5000,
      })

      const data = response.data

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Resposta vazia da API do Banco Central')
      }

      const entry = data[0]
      const rateDate = DateTime.fromFormat(entry.data, 'dd/MM/yyyy').toISODate()
      const rate = Number(entry.valor.replace(',', '.'))

      if (!rateDate || Number.isNaN(rate) || !Number.isFinite(rate)) {
        throw new Error('Resposta inválida da API do Banco Central')
      }

      return { rate, rateDate }
    } catch (error: any) {
      logger.error(`Erro ao buscar cotação USD-BRL do Banco Central: ${error.message}`)

      const lastCached = await ExchangeRate.query()
        .where('base_currency', BASE_CURRENCY)
        .where('target_currency', TARGET_CURRENCY)
        .orderBy('rate_date', 'desc')
        .first()

      if (lastCached?.rate != null) {
        logger.warn(`Usando última cotação em cache de ${lastCached.rateDate}`)
        return { rate: Number(lastCached.rate), rateDate: lastCached.rateDate }
      }

      throw error
    }
  }
}
