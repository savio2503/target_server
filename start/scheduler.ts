/*
|--------------------------------------------------------------------------
| Agendador de tarefas (cron)
|--------------------------------------------------------------------------
|
| Roda tarefas periódicas enquanto o processo do servidor HTTP estiver de
| pé. Este arquivo só é carregado no ambiente "web" (veja adonisrc.ts),
| então NÃO roda durante comandos ace comuns, testes ou migrations.
|
*/

import cron from 'node-cron'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { runPriceCheck } from '#services/price_check_runner'

const ENABLED = env.get('PRICE_CHECK_CRON_ENABLED', true)

if (ENABLED) {
  let isRunning = false

  // Roda a cada 1 hora, no minuto 0 (ex: 13:00, 14:00, 15:00...)
  cron.schedule('0 * * * *', async () => {
    if (isRunning) {
      logger.warn('[PriceCheck] execução anterior ainda em andamento, pulando este ciclo')
      return
    }

    isRunning = true
    try {
      await runPriceCheck()
    } catch (error) {
      logger.error(`[PriceCheck] falha inesperada no agendador: ${error.message}`)
    } finally {
      isRunning = false
    }
  })

  logger.info('[PriceCheck] agendador iniciado (executa a cada 1 hora)')
} else {
  logger.info('[PriceCheck] agendador desativado via PRICE_CHECK_CRON_ENABLED=false')
}
