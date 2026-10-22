import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ImageStorageService from '#services/image_storage_service'

export default class MigrateImagesToDisk extends BaseCommand {
  static commandName = 'images:migrate'
  static description = 'Migra imagens em Base64 armazenadas no MySQL para arquivos no sistema de arquivos em disco'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Buscando imagens que necessitam de migração no MySQL...')

    const startTime = Date.now()
    const result = await ImageStorageService.migrateAll((migrated, total, targetId) => {
      this.logger.info(`[${migrated}/${total}] Target ${targetId} migrado para disco com sucesso.`)
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.total === 0) {
      this.logger.success('Nenhuma imagem pendente de migração no banco de dados. Tudo atualizado!')
      return
    }

    this.logger.success(
      `Migração finalizada em ${duration}s! Total: ${result.total} | Sucesso: ${result.migrated} | Erros: ${result.errors}`
    )
  }
}
