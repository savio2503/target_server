import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Código de 2FA (armazenado com hash, nunca em texto puro)
      table.string('two_factor_code_hash', 255).nullable()
      table.timestamp('two_factor_expires_at', { useTz: true }).nullable()
      table.integer('two_factor_attempts').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('two_factor_code_hash')
      table.dropColumn('two_factor_expires_at')
      table.dropColumn('two_factor_attempts')
    })
  }
}
