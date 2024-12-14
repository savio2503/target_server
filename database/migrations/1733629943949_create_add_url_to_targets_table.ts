import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddUrlToTargets extends BaseSchema {
  protected tableName = 'targets'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('url').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('url')
    })
  }
}