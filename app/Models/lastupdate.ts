import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Lastupdate extends BaseModel {
  public static table = 'lastupdates' // Nome correto da tabela no banco de dados
  
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare table: string

  @column()
  declare action: string

  @column()
  declare detail: string | null

  @column.dateTime({ columnName: 'date_update'})
  declare dateUpdate: DateTime

  @column()
  declare user: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}