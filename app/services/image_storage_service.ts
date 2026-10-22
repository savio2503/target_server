import { promises as fs } from 'node:fs'
import path from 'node:path'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import sharp from 'sharp'
import ImagemTarget from '#models/imagem_target'

export default class ImageStorageService {
  private static storageBaseDir: string | null = null

  /**
   * Obtém o diretório raiz de armazenamento de imagens.
   * Prioridade: STORAGE_PATH (do .env) > storage/uploads/targets (raiz do projeto)
   */
  public static getStorageDir(): string {
    if (this.storageBaseDir) {
      return this.storageBaseDir
    }

    const envPath = env.get('STORAGE_PATH')
    if (envPath && envPath.trim() !== '') {
      this.storageBaseDir = path.resolve(envPath, 'targets')
    } else {
      this.storageBaseDir = app.makePath('storage/uploads/targets')
    }

    return this.storageBaseDir
  }

  public static getOriginalDir(): string {
    return path.join(this.getStorageDir(), 'original')
  }

  public static getCacheDir(): string {
    return path.join(this.getStorageDir(), 'cache')
  }

  private static async ensureDirs(): Promise<void> {
    await fs.mkdir(this.getOriginalDir(), { recursive: true })
    await fs.mkdir(this.getCacheDir(), { recursive: true })
  }

  /**
   * Extrai a string Base64 pura de um data URI ou valor bruto.
   */
  public static extractPureBase64(input: string): string {
    const match = input.match(/^data:image\/[a-zA-Z0-9.+]+;base64,(.+)$/)
    return match ? match[1] : input
  }

  /**
   * Identifica se o valor é uma URL ou espaço em branco.
   */
  public static isUrlOrEmpty(value: string | null | undefined): boolean {
    if (!value || value.trim() === '') return true
    const trimmed = value.trim().toLowerCase()
    return trimmed.startsWith('http://') || trimmed.startsWith('https://')
  }

  /**
   * Encontra o arquivo original em disco para um target específico.
   */
  private static async findOriginalFile(idTarget: number): Promise<string | null> {
    try {
      const originalDir = this.getOriginalDir()
      const files = await fs.readdir(originalDir)
      const prefix = `target_${idTarget}.`
      const match = files.find((file) => file.startsWith(prefix))
      return match ? path.join(originalDir, match) : null
    } catch {
      return null
    }
  }

  /**
   * Salva uma imagem original de target no disco.
   * Invalida automaticamente qualquer cache redimensionado anterior para o target.
   * Retorna o marcador a ser persistido no banco de dados (ex: 'disk:target_1.webp' ou URL original).
   */
  public static async saveTargetImage(
    idTarget: number,
    imagemInput: string | null | undefined
  ): Promise<string> {
    if (!imagemInput || imagemInput.trim() === '') {
      await this.deleteTargetImage(idTarget)
      return ' '
    }

    const trimmed = imagemInput.trim()
    if (trimmed.toLowerCase().startsWith('http://') || trimmed.toLowerCase().startsWith('https://')) {
      await this.deleteTargetImage(idTarget)
      return trimmed
    }

    await this.ensureDirs()

    const pureBase64 = this.extractPureBase64(trimmed)
    const buffer = Buffer.from(pureBase64, 'base64')
    if (buffer.length === 0) {
      return ' '
    }

    // Detecta formato através dos metadados do sharp
    let format = 'webp'
    try {
      const metadata = await sharp(buffer).metadata()
      if (metadata.format) {
        format = metadata.format
      }
    } catch (err) {
      logger.warn(`[ImageStorage] Não foi possível ler metadados do target ${idTarget}: ${err.message}`)
    }

    // Remove qualquer arquivo original antigo com outra extensão
    const oldFile = await this.findOriginalFile(idTarget)
    if (oldFile) {
      await fs.unlink(oldFile).catch(() => {})
    }

    const filename = `target_${idTarget}.${format}`
    const targetPath = path.join(this.getOriginalDir(), filename)
    await fs.writeFile(targetPath, buffer)

    // Invalida cache de variantes redimensionadas
    await this.clearTargetCache(idTarget)

    logger.info(`[ImageStorage] Imagem do target ${idTarget} salva em disco: ${filename}`)
    return `disk:${filename}`
  }

  /**
   * Obtém a imagem do target para resposta na API.
   * Utiliza cache em disco para versões redimensionadas (tamMax) e migração sob demanda (lazy)
   * caso a imagem ainda esteja armazenada como Base64 no banco de dados MySQL.
   */
  public static async getTargetImage(
    idTarget: number,
    tamMax?: number | string | null
  ): Promise<string | null> {
    await this.ensureDirs()

    let safeTamMax: number | null = null
    if (tamMax !== undefined && tamMax !== null && tamMax !== '') {
      const parsed = parseInt(String(tamMax), 10)
      if (!Number.isNaN(parsed)) {
        safeTamMax = Math.min(Math.max(parsed, 16), 2048)
      }
    }

    // 1. Se pediu redimensionamento, verifica se já existe versão em cache no disco
    if (safeTamMax) {
      const cacheFile = path.join(this.getCacheDir(), `target_${idTarget}_s${safeTamMax}.cache`)
      try {
        const cachedBase64 = await fs.readFile(cacheFile, 'utf-8')
        if (cachedBase64 && cachedBase64.length > 0) {
          return cachedBase64
        }
      } catch {
        // Cache miss: continua para obter o original e gerar
      }
    }

    // 2. Busca o buffer original
    let originalBuffer: Buffer | null = null
    const originalFile = await this.findOriginalFile(idTarget)

    if (originalFile) {
      try {
        originalBuffer = await fs.readFile(originalFile)
      } catch (err) {
        logger.error(`[ImageStorage] Erro ao ler arquivo ${originalFile}: ${err.message}`)
      }
    }

    // 3. Se não achou no disco, busca no MySQL (migração sob demanda / fallback)
    if (!originalBuffer) {
      const record = await ImagemTarget.query().where('idTarget', idTarget).select('id', 'imagem').first()
      if (!record) {
        return null
      }

      const dbImagem = record.imagem
      if (!dbImagem || dbImagem.trim() === '') {
        return ' '
      }

      if (dbImagem.toLowerCase().startsWith('http') || dbImagem.startsWith(' ')) {
        return dbImagem
      }

      // Se começa com disk: mas o arquivo não foi achado no disco
      if (dbImagem.startsWith('disk:')) {
        logger.warn(`[ImageStorage] Registro marcado como disk:${dbImagem} mas não encontrado em disco para target ${idTarget}`)
        return ' '
      }

      // É uma string Base64 no banco: migra sob demanda para o disco
      try {
        const pureBase64 = this.extractPureBase64(dbImagem)
        originalBuffer = Buffer.from(pureBase64, 'base64')

        if (originalBuffer.length > 0) {
          let format = 'webp'
          try {
            const meta = await sharp(originalBuffer).metadata()
            if (meta.format) format = meta.format
          } catch {}

          const filename = `target_${idTarget}.${format}`
          const filePath = path.join(this.getOriginalDir(), filename)
          await fs.writeFile(filePath, originalBuffer)

          // Atualiza o banco para desocupar memória do MySQL
          record.imagem = `disk:${filename}`
          await record.save()
          logger.info(`[ImageStorage] Migrado sob demanda do MySQL para disco: target ${idTarget} -> ${filename}`)
        } else {
          return ' '
        }
      } catch (err) {
        logger.error(`[ImageStorage] Falha ao processar Base64 do banco para target ${idTarget}: ${err.message}`)
        return ' '
      }
    }

    if (!originalBuffer || originalBuffer.length === 0) {
      return ' '
    }

    // 4. Se não precisa de redimensionamento, retorna o Base64 original
    if (!safeTamMax) {
      return originalBuffer.toString('base64')
    }

    // 5. Redimensiona com Sharp e grava no cache em disco
    try {
      const resizedBuffer = await sharp(originalBuffer)
        .resize({
          width: safeTamMax,
          height: safeTamMax,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toBuffer()

      const resizedBase64 = resizedBuffer.toString('base64')

      const cacheFile = path.join(this.getCacheDir(), `target_${idTarget}_s${safeTamMax}.cache`)
      await fs.writeFile(cacheFile, resizedBase64, 'utf-8').catch((err) => {
        logger.warn(`[ImageStorage] Falha ao gravar cache de imagem ${idTarget}: ${err.message}`)
      })

      return resizedBase64
    } catch (err) {
      logger.error(`[ImageStorage] Falha no redimensionamento Sharp para target ${idTarget}: ${err.message}`)
      return originalBuffer.toString('base64')
    }
  }

  /**
   * Resolve o valor para Base64 (usado na listagem index para compatibilidade).
   */
  public static async resolveBase64(idTarget: number, storedValue: string | null | undefined): Promise<string> {
    if (!storedValue || storedValue.trim() === '') return ' '
    if (storedValue.toLowerCase().startsWith('http') || storedValue.startsWith(' ')) {
      return storedValue
    }
    if (storedValue.startsWith('disk:')) {
      const originalFile = await this.findOriginalFile(idTarget)
      if (originalFile) {
        try {
          const buffer = await fs.readFile(originalFile)
          return buffer.toString('base64')
        } catch {
          return ' '
        }
      }
      return ' '
    }
    return storedValue
  }

  /**
   * Invalida todos os arquivos de cache de um target.
   */
  public static async clearTargetCache(idTarget: number): Promise<void> {
    try {
      const cacheDir = this.getCacheDir()
      const files = await fs.readdir(cacheDir)
      const prefix = `target_${idTarget}_`
      for (const file of files) {
        if (file.startsWith(prefix)) {
          await fs.unlink(path.join(cacheDir, file)).catch(() => {})
        }
      }
    } catch {
      // Ignora se o diretório não existir ainda
    }
  }

  /**
   * Deleta a imagem original e todos os arquivos em cache do target.
   */
  public static async deleteTargetImage(idTarget: number): Promise<void> {
    const originalFile = await this.findOriginalFile(idTarget)
    if (originalFile) {
      await fs.unlink(originalFile).catch(() => {})
    }
    await this.clearTargetCache(idTarget)
  }

  /**
   * Executa a migração em lote de imagens que ainda estão como Base64 no banco.
   */
  public static async migrateAll(
    onProgress?: (migrated: number, total: number, currentTargetId: number) => void
  ): Promise<{ total: number; migrated: number; errors: number }> {
    await this.ensureDirs()

    const records = await ImagemTarget.query()
      .whereNotNull('imagem')
      .whereRaw("imagem NOT LIKE 'disk:%'")
      .whereRaw("imagem NOT LIKE 'http%'")
      .whereRaw("imagem != ' '")
      .whereRaw('LENGTH(imagem) > 50')

    let migrated = 0
    let errors = 0
    const total = records.length

    for (const record of records) {
      try {
        const marker = await this.saveTargetImage(record.idTarget, record.imagem)
        record.imagem = marker
        await record.save()
        migrated++
        if (onProgress) {
          onProgress(migrated, total, record.idTarget)
        }
      } catch (err) {
        errors++
        logger.error(`[ImageStorage] Erro ao migrar imagem do target ${record.idTarget}: ${err.message}`)
      }
    }

    return { total, migrated, errors }
  }
}
