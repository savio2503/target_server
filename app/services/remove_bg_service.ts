import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import sharp from 'sharp'
import axios from 'axios'
import ImageStorageService from '#services/image_storage_service'

export default class RemoveBgService {
  /**
   * Obtém a URL do serviço remove-bg interno (default: http://127.0.0.1:9000/remove-background)
   */
  public static getServiceUrl(): string {
    const configured = env.get('REMOVE_BG_URL')
    if (configured && configured.trim() !== '') {
      return configured.trim()
    }
    return 'http://127.0.0.1:9000/remove-background'
  }

  /**
   * Obtém o Buffer de uma imagem a partir de uma URL ou string Base64.
   */
  public static async resolveInputToBuffer(input: string): Promise<Buffer> {
    const trimmed = input.trim()
    if (!trimmed) {
      throw new Error('Nenhuma imagem fornecida.')
    }

    if (trimmed.toLowerCase().startsWith('http://') || trimmed.toLowerCase().startsWith('https://')) {
      logger.info(`[RemoveBgService] Baixando imagem da URL externa: ${trimmed}`)
      const resp = await axios.get<ArrayBuffer>(trimmed, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
      return Buffer.from(resp.data)
    }

    const pureBase64 = ImageStorageService.extractPureBase64(trimmed)
    const buffer = Buffer.from(pureBase64, 'base64')
    if (buffer.length === 0) {
      throw new Error('Base64 da imagem inválido ou vazio.')
    }
    return buffer
  }

  /**
   * Executa a remoção de fundo chamando o microserviço remove-bg internamente,
   * recorta as bordas transparentes com Sharp e retorna a imagem em Base64 puro.
   */
  public static async removeBackground(input: string): Promise<string> {
    const inputBuffer = await this.resolveInputToBuffer(input)

    // Otimiza / normaliza a imagem inicial se necessário antes do envio
    const normalizedBuffer = await sharp(inputBuffer)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()

    const serviceUrl = this.getServiceUrl()
    logger.info(`[RemoveBgService] Enviando requisição para ${serviceUrl}`)

    const formData = new FormData()
    formData.append('file', new Blob([normalizedBuffer], { type: 'image/png' }), 'image.png')

    let response: Response
    try {
      response = await fetch(serviceUrl, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(90000), // 90 segundos para suportar Raspberry Pi 3
      })
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.code === 23) {
        logger.error(`[RemoveBgService] Timeout de 90s ao chamar ${serviceUrl}`)
        throw new Error('Tempo limite excedido ao processar a remoção de fundo no servidor.')
      }
      logger.error(`[RemoveBgService] Falha na conexão com ${serviceUrl}: ${err.message}`)
      throw new Error(`Não foi possível conectar ao serviço remove-bg (${serviceUrl}). Verifique se está em execução.`)
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      logger.error(`[RemoveBgService] Erro retornado pelo remove-bg (${response.status}): ${errorText}`)
      throw new Error(`Erro no serviço de remoção de fundo: ${errorText || response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const resultBuffer = Buffer.from(arrayBuffer)

    // Aplica o trim para recortar bordas transparentes excedentes (crop automático)
    let finalBuffer: Buffer
    try {
      finalBuffer = await sharp(resultBuffer).trim().png().toBuffer()
    } catch (trimErr: any) {
      logger.warn(`[RemoveBgService] Falha ao aplicar trim com Sharp (${trimErr.message}), usando imagem original`)
      finalBuffer = resultBuffer
    }

    return finalBuffer.toString('base64')
  }
}
