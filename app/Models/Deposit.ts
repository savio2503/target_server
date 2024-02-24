import { DateTime } from 'luxon'
import { BaseModel, column, hasOne } from '@adonisjs/lucid/orm'
import Target from './target.js'

export default class Deposit extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare targetId: number

  @column()
  declare valor: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasOne(() => Target, {
    localKey: 'targetId',
    foreignKey: 'id',
  })
  public target: HasOne<typeof Target>

  toString() {
    return `Deposit=[id: ${this.id}, target: ${this.targetId}, valor: ${this.valor}]`
  }
}