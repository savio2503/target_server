import { DateTime } from 'luxon'
import { BaseModel, column, hasOne } from '@adonisjs/lucid/orm'
import Target from './target.js'

export default class ImagemTarget extends BaseModel {
  public static table = 'imagem_target' // Nome correto da tabela no banco de dados

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare idTarget: number

  @column()
  declare imagem: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasOne(() => Target, {
    localKey: 'idTarget',
    foreignKey: 'id',
  })
  declare target: HasOne<typeof Target>
}