import { DateTime } from 'luxon'
import { BaseModel, HasOne, column, hasOne } from '@ioc:Adonis/Lucid/Orm'
import User from './User'

export default class Historic extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public valor: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @column()
  public userId: number

  @hasOne(() => User, {
    localKey: 'userId',
    foreignKey: 'id',
  })
  public user: HasOne<typeof User>
}
