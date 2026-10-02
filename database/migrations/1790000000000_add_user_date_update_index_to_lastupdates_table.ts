import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lastupdates'

  async up() {
    // Usado por /lastupdates/:date e /all/:order/since/:lastUpdate
    // (where user = ? and date_update > ?). Sem índice a tabela é varrida inteira.
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['user', 'date_update'], 'lastupdates_user_date_update_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['user', 'date_update'], 'lastupdates_user_date_update_idx')
    })
  }
}
