import { DateTime } from 'luxon'
import { BaseModel, HasOne, column, hasOne } from '@ioc:Adonis/Lucid/Orm'
import User from './User'
import Coin from './Coin'

export default class Target extends BaseModel {
  @column({ isPrimary: true })
  public id: number

  @column()
  public descricao: string

  @column()
  public valor: number

  @column()
  public posicao: number

  @column()
  public ativo: boolean

  @column()
  public imagem: string

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

  @column()
  public coinId: number

  @hasOne(() => Coin, {
    localKey: 'coinId',
    foreignKey: 'id',
  })
  public coin: HasOne<typeof Coin>

  @column()
  public totalDeposit: number

  @column()
  public porcetagem: number

  toString() {
    return `Target=[id: ${this.id}, descricao: ${this.descricao}, posicao: ${this.posicao}, ativo: ${this.ativo}, userId: ${this.userId}, coin: ${this.coin}, totalDeposit: ${this.totalDeposit}, porcetagem: ${this.porcetagem}]`
  }
 
}
