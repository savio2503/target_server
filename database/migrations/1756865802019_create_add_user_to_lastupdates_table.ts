import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lastupdates'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('user').unsigned().notNullable().defaultTo(0) // coluna de usuário
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('user')
    })
  }
}