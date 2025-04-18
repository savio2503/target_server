import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'targets'

  async up() {
    const hasTable = await this.schema.hasTable(this.tableName) // Verifica se a tabela já existe
    if (!hasTable) {
      this.schema.createTable(this.tableName, (table) => {
        table.increments('id').primary()
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
        //table.integer('coin_id').unsigned().references('id').inTable('coins')
        table.string('descricao').notNullable()
        table.decimal('valor', 15, 2).notNullable()
        table.integer('posicao').notNullable().defaultTo(0)
        table.boolean('ativo').notNullable().defaultTo(true)
        table.text('imagem', 'longtext').defaultTo(" ")
        table.integer('coin_id').unsigned().references('id').inTable('coins')
        table.boolean('comprado').notNullable().defaultTo(false)
        table.boolean('removebackground').notNullable().defaultTo(false)

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