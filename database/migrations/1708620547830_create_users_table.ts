import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    const hasTable = await this.schema.hasTable(this.tableName) // Verifica se a tabela já existe
    if (!hasTable) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id').notNullable()
        table.string('email', 254).notNullable().unique()
        table.string('password', 180).notNullable()

        table.timestamp('created_at', { useTz: true }).notNullable()
        table.timestamp('updated_at', { useTz: true }).notNullable()
      })
    }
  }

  async down() {
    const hasTable = await this.schema.hasTable(this.tableName) // Verifica se a tabela existe antes de tentar apagá-la
    if (hasTable) {
      this.schema.dropTable(this.tableName)
    }
  }
}