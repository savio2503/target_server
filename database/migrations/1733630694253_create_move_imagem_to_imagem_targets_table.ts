import { BaseSchema } from "@adonisjs/lucid/schema"
import db from "@adonisjs/lucid/services/db"

export default class MoveImagemToImagemTarget extends BaseSchema {
  protected tableName = 'targets'

  async up() {
    // Transferindo dados para imagem_target
    //const targets = await Database.from(this.tableName).select('id', 'imagem')
    const targets = await db.from(this.tableName).select('id','imagem')
    for (const target of targets) {
      if (target.imagem) {
        await db.table('imagem_target').insert({
          id_target: target.id,
          imagem: target.imagem,
        })
      }
    }

    // Removendo a coluna imagem da tabela targets
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('imagem')
    })
  }

  async down() {
    // Revertendo: Adiciona a coluna imagem novamente em targets
    this.schema.alterTable(this.tableName, (table) => {
      table.text('imagem', 'longtext').defaultTo(' ')
    })

    // Re-transferindo os dados de volta para a coluna imagem
    const imagens = await db.from('imagem_target').select('id_target', 'imagem')
    for (const imagem of imagens) {
      await db.from(this.tableName).where('id', imagem.id_target).update({
        imagem: imagem.imagem,
      })
    }

    // Deletando os dados da tabela imagem_target
    await db.from('imagem_target').delete()
  }
}