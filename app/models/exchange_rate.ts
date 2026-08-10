import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ExchangeRate extends BaseModel {
  public static table = 'exchange_rates'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare baseCurrency: string

  @column()
  declare targetCurrency: string

  @column({ columnName: 'rate_date' })
  declare rateDate: string

  @column()
  declare rate: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
