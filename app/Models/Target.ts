import { DateTime } from 'luxon'
import { BaseModel, column, hasOne } from '@adonisjs/lucid/orm'
import Coin from './coin.js'
import User from './user.js'

export default class Target extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare descricao: string

  @column()
  declare valor: number

  @column()
  declare posicao: number

  @column()
  declare ativo: boolean

  @column()
  declare imagem: string

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
  declare user: HasOne<typeof User>

  @column()
  declare coinId: number

  @hasOne(() => Coin, {
    localKey: 'coinId',
    foreignKey: 'id',
  })
  declare coin: HasOne<typeof Coin>

  @column()
  declare totalDeposit: number

  @column()
  declare porcetagem: number

  toString() {
    return `Target=[id: ${this.id}, descricao: ${this.descricao}, posicao: ${this.posicao}, ativo: ${this.ativo}, userId: ${this.userId}, coin: ${this.coin}, totalDeposit: ${this.totalDeposit}, porcetagem: ${this.porcetagem}]`
  }
}