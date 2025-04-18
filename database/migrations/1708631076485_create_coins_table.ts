import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'coins'

  async up() {
    const hasTable = await this.schema.hasTable(this.tableName) // Verifica se a tabela já existe
    if (!hasTable) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id').primary()
        table.string('name')
        table.string('symbol')
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