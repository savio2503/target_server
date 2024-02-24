import { DateTime } from 'luxon'
import { BaseModel, column, hasOne } from '@adonisjs/lucid/orm'
import User from './user.js'

export default class Historic extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare valor: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column()
  declare userId: number

  @hasOne(() => User, {
    localKey: 'userId',
    foreignKey: 'id',
  })
  public user: HasOne<typeof User>
}