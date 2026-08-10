import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'exchange_rates'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('base_currency', 3).notNullable().defaultTo('USD')
      table.string('target_currency', 3).notNullable().defaultTo('BRL')
      table.date('rate_date').notNullable()
      table.decimal('rate', 14, 10).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.unique(['base_currency', 'target_currency', 'rate_date'])
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
