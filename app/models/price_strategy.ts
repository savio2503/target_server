import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type PriceStrategyName = 'adapter' | 'jsonld' | 'opengraph' | 'microdata' | 'api' | 'llm'

export default class PriceStrategy extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare domain: string

  @column()
  declare strategy: PriceStrategyName

  @column()
  declare learnedSelector: string | null

  @column()
  declare successCount: number

  @column()
  declare failCount: number

  @column()
  declare lastPrice: number | null

  @column.dateTime()
  declare lastSuccessAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
