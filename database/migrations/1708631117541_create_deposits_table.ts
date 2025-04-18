import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'deposits'

  async up() {
    const hasTable = await this.schema.hasTable(this.tableName) // Verifica se a tabela já existe
    if (!hasTable) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id')
        table.integer('target_id').unsigned().notNullable().references('id').inTable('targets')
        table.decimal('valor', 15, 2).notNullable()

        table.timestamp('created_at')
        table.timestamp('updated_at')
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