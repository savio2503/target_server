import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'target_all_caches'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_stale').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_stale')
    })
  }
}