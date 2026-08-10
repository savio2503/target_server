/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring session package
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),

  /*
  |----------------------------------------------------------
  | Chave da API da Anthropic, usada como fallback do
  | PriceAgentService quando nenhum adapter/dado estruturado
  | resolve o preço de um site novo. Opcional: se ausente, o
  | agente simplesmente pula essa camada.
  |----------------------------------------------------------
  */
  ANTHROPIC_API_KEY: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Liga/desliga o agendador automático (start/scheduler.ts)
  | que roda a checagem de preços a cada 1 hora. Padrão: true.
  | Útil para desativar em ambientes onde o cron é feito
  | externamente (ex: painel de Cron Jobs da hospedagem).
  |----------------------------------------------------------
  */
  PRICE_CHECK_CRON_ENABLED: Env.schema.boolean.optional()
})
