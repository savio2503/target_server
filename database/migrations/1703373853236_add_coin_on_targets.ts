import BaseSchema from '@ioc:Adonis/Lucid/Schema'

export default class extends BaseSchema {
  protected tableName = 'targets'

  public async up () {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('coin_id').unsigned().references('id').inTable('coins')
    })
  }

  public async down () {
    this.schema.dropTable(this.tableName)
  }
}
