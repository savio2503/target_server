import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ImageStorageService from '#services/image_storage_service'

export default class WarmImagesCache extends BaseCommand {
  static commandName = 'images:warm-cache'
  static description =
    'Varre todas as imagens em disco e pré-aquece/regenera os caches redimensionados (100 e 200)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description: 'Força a regeração dos arquivos de cache mesmo se já existirem no disco',
    default: false,
  })
  declare force: boolean

  async run() {
    this.logger.info(
      `Iniciando pré-aquecimento de caches de imagens (tamanhos: ${ImageStorageService.PREWARM_SIZES.join(', ')}) [force=${this.force}]...`
    )

    const startTime = Date.now()

    const result = await ImageStorageService.warmAllCaches(
      ImageStorageService.PREWARM_SIZES,
      this.force,
      (current, total, targetId, generated, corrupt) => {
        if (corrupt) {
          this.logger.warning(`[${current}/${total}] Target ${targetId}: arquivo corrompido detectado e removido.`)
        } else if (generated > 0) {
          this.logger.info(`[${current}/${total}] Target ${targetId}: gerados ${generated} novos arquivos de cache.`)
        }
      }
    )

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.total === 0) {
      this.logger.warning('Nenhuma imagem encontrada na pasta original de targets.')
      return
    }

    this.logger.success(
      `Concluído em ${duration}s! Targets verificados: ${result.total} | Alvos com novo cache: ${result.warmedTargets} | Arquivos gerados: ${result.generatedFiles} | Arquivos mantidos: ${result.skippedFiles} | Corrompidos limpos: ${result.corruptCleaned} | Erros: ${result.errors}`
    )
  }
}
