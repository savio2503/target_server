import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateImagemTarget extends BaseSchema {
  protected tableName = 'imagem_target'

  async up() {
    const hasTable = await this.schema.hasTable(this.tableName) // Verifica se a tabela já existe
    if (!hasTable) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id').primary()
        table.integer('id_target').unsigned().notNullable().references('id').inTable('targets').onDelete('CASCADE')
        table.text('imagem', 'longtext').notNullable()
        table.timestamp('created_at').defaultTo(this.now())
        table.timestamp('updated_at').defaultTo(this.now())
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