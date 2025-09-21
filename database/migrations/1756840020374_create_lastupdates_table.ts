import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lastupdates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id') // chave primária
      table.string('table', 100).notNullable()   // nome da tabela afetada
      table.string('action', 50).notNullable()  // ex: insert, update, delete
      table.text('detail').nullable()           // detalhes da ação
      table.timestamp('date_update', { useTz: true }).notNullable() // data/hora do update

      table.timestamps(true) // created_at e updated_at automáticos
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}