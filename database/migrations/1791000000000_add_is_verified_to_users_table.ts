import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Usuários já existentes no banco permanecem como verificados (defaultTo: true).
      // Novos cadastros pelo fluxo de signin serão criados com false até a confirmação do código.
      table.boolean('is_verified').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_verified')
    })
  }
}
