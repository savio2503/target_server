import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'target_all_caches'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
      table.integer('order').unsigned().notNullable()
      table.text('result', 'longtext').notNullable()
      table.timestamp('captured_at').notNullable()

      table.unique(['user_id', 'order'])
      table.index(['captured_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
