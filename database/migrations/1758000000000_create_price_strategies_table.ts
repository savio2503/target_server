import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreatePriceStrategies extends BaseSchema {
  protected tableName = 'price_strategies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('domain').notNullable().unique()

      // 'adapter' | 'jsonld' | 'opengraph' | 'microdata' | 'api' | 'llm'
      table.string('strategy').notNullable()

      // Guarda o seletor CSS aprendido via LLM, quando aplicável (permite
      // pular a chamada de LLM em consultas futuras para o mesmo domínio).
      table.string('learned_selector').nullable()

      table.integer('success_count').notNullable().defaultTo(0)
      table.integer('fail_count').notNullable().defaultTo(0)
      table.decimal('last_price', 12, 2).nullable()
      table.timestamp('last_success_at').nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
