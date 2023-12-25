import { DateTime } from 'luxon'
import { BaseModel, HasOne, column, hasOne } from '@ioc:Adonis/Lucid/Orm'
import Target from './Target'

export default class Deposit extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public targetId: number

  @column()
  public valor: number

  @column.dateTime({ autoCreate: true })
  public createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  public updatedAt: DateTime

  @hasOne(() => Target, {
    localKey: 'targetId',
    foreignKey: 'id',
  })
  public target: HasOne<typeof Target>
}
