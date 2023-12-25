import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'targets'

  public async up () {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
      //table.integer('coin_id').unsigned().references('id').inTable('coins')
      table.string('descricao').notNullable()
      table.decimal('valor', 15,2).notNullable()
      table.integer('posicao').notNullable().defaultTo(0)
      table.boolean('ativo').notNullable().defaultTo(true)
      table.text('imagem','longtext').defaultTo(" ")
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  public async down () {
    this.schema.dropTable(this.tableName)
  }
}
