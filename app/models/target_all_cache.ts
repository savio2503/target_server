import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class TargetAllCache extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare order: number

  @column()
  declare result: string

  @column()
  declare isStale: boolean

  @column.dateTime()
  declare capturedAt: DateTime
}
