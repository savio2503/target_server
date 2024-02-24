import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Coin extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare symbol: string
}