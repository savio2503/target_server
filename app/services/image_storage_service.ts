import { promises as fs } from 'node:fs'
import path from 'node:path'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import sharp from 'sharp'
import ImagemTarget from '#models/imagem_target'
import ImageConverter from '../helpers/ImageConverter.js'

// Configura Sharp para 1 thread por worker do PM2 para evitar disputa de CPU/RAM no Raspberry Pi
try {
  sharp.concurrency(1)
} catch {
  // Ignora se não for suportado no ambiente
}

export default class ImageStorageService {
  private static storageBaseDir: string | null = null

  /**
   * Tamanhos padrões pré-aquecidos de forma síncrona no upload/update
   */
  public static readonly PREWARM_SIZES = [100, 200] as const

  private static readonly COMMON_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg'] as const

  /**
   * Mapa de promessas em andamento para deduplicação de redimensionamentos simultâneos
   */
  private static inFlightResizes = new Map<string, Promise<string | null>>()

  /**
   * Permite redefinir o diretório base de armazenamento (útil para testes unitários)
   */
  public static setStorageDir(dir: string | null): void {
    this.storageBaseDir = dir
  }

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
    try {
      await fs.mkdir(this.getOriginalDir(), { recursive: true })
      await fs.mkdir(this.getCacheDir(), { recursive: true })
    } catch (err: any) {
      // Fallback resiliente caso STORAGE_PATH seja de outro SO (ex: Linux /home/savio no Mac)
      const defaultLocal = app.makePath('storage/uploads/targets')
      if (this.storageBaseDir && this.storageBaseDir !== defaultLocal) {
        logger.warn(
          `[ImageStorage] Não foi possível criar diretório configurado em STORAGE_PATH (${this.storageBaseDir}): ${err.message}. Usando fallback local: ${defaultLocal}`
        )
        this.storageBaseDir = defaultLocal
        await fs.mkdir(this.getOriginalDir(), { recursive: true })
        await fs.mkdir(this.getCacheDir(), { recursive: true })
        return
      }
      throw err
    }
  }

  /**
   * Grava um arquivo no disco de forma atômica (grava em .tmp e depois renomeia)
   * Previne arquivos de 0-bytes ou corrompidos em caso de leitura concorrente ou crash.
   */
  private static async atomicWriteFile(filePath: string, content: string | Buffer): Promise<void> {
    const tmpPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    await fs.writeFile(tmpPath, content)
    await fs.rename(tmpPath, filePath)
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
   * Utiliza verificação direta das extensões mais comuns primeiro (O(1)) para evitar readdir caro.
   */
  public static async findOriginalFile(idTarget: number): Promise<string | null> {
    const originalDir = this.getOriginalDir()

    // 1. Caminho rápido: checa formatos comuns diretamente sem varrer toda a pasta
    for (const ext of this.COMMON_EXTENSIONS) {
      const candidate = path.join(originalDir, `target_${idTarget}.${ext}`)
      try {
        await fs.access(candidate)
        return candidate
      } catch {}
    }

    // 2. Fallback: escaneia o diretório se tiver uma extensão incomum
    try {
      const files = await fs.readdir(originalDir)
      const prefix = `target_${idTarget}.`
      const match = files.find((file) => file.startsWith(prefix))
      return match ? path.join(originalDir, match) : null
    } catch {
      return null
    }
  }

  /**
   * Redimensiona um buffer com Sharp e grava no cache em disco de forma atômica.
   */
  public static async resizeAndCache(
    idTarget: number,
    buffer: Buffer,
    tamMax: number
  ): Promise<string> {
    const safeTamMax = Math.min(Math.max(tamMax, 16), 2048)

    const resizedBuffer = await sharp(buffer)
      .resize({
        width: safeTamMax,
        height: safeTamMax,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer()

    const resizedBase64 = resizedBuffer.toString('base64')
    const cacheFile = path.join(this.getCacheDir(), `target_${idTarget}_s${safeTamMax}.cache`)

    try {
      await this.atomicWriteFile(cacheFile, resizedBase64)
    } catch (err: any) {
      logger.warn(
        `[ImageStorage] Falha ao gravar cache atômico de imagem ${idTarget} (s${safeTamMax}): ${err.message}`
      )
    }

    return resizedBase64
  }

  /**
   * Salva uma imagem original de target no disco.
   * Suporta dados em Base64 ou URL (que é baixada de forma segura).
   * Invalida qualquer cache redimensionado anterior para o target.
   * Pré-aquece de forma síncrona as variantes de cache (100 e 200) para garantir entrega instantânea.
   * Retorna o marcador a ser persistido no banco de dados (ex: 'disk:target_1.webp').
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

    // Se for URL, faz o download seguro via ImageConverter e converte para Base64
    let base64ToProcess = trimmed
    if (ImageConverter.isURL(trimmed)) {
      base64ToProcess = await ImageConverter.convertUrlToBase64(trimmed)
    }

    await this.ensureDirs()

    const pureBase64 = this.extractPureBase64(base64ToProcess)
    const buffer = Buffer.from(pureBase64, 'base64')
    if (buffer.length === 0) {
      return ' '
    }

    // Validação estrita de formato via sharp antes de criar qualquer arquivo físico
    let format = 'webp'
    try {
      const metadata = await sharp(buffer).metadata()
      if (!metadata.format) {
        throw new Error('Formato de imagem não reconhecido.')
      }
      format = metadata.format
    } catch (err: any) {
      throw new Error(`Imagem inválida ou corrompida: ${err.message}`)
    }

    // Remove qualquer arquivo original antigo com outra extensão
    const oldFile = await this.findOriginalFile(idTarget)
    if (oldFile) {
      await fs.unlink(oldFile).catch(() => {})
    }

    const filename = `target_${idTarget}.${format}`
    const targetPath = path.join(this.getOriginalDir(), filename)
    await this.atomicWriteFile(targetPath, buffer)

    // Invalida cache antigo
    await this.clearTargetCache(idTarget)

    // Pré-aquecimento síncrono para os tamanhos padrão (100 e 200)
    for (const size of this.PREWARM_SIZES) {
      try {
        await this.resizeAndCache(idTarget, buffer, size)
      } catch (err: any) {
        logger.warn(
          `[ImageStorage] Falha ao pré-aquecer cache para target ${idTarget} (s${size}): ${err.message}`
        )
      }
    }

    logger.info(`[ImageStorage] Imagem do target ${idTarget} salva e cache pré-aquecido: ${filename}`)
    return `disk:${filename}`
  }

  /**
   * Obtém a imagem do target para resposta na API.
   * Utiliza cache em disco para versões redimensionadas (tamMax), deduplicação em voo,
   * e migração sob demanda (lazy) caso a imagem ainda esteja no MySQL.
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

    // 2. Se há redimensionamento em voo sendo gerado para este mesmo target e tamanho, aguarda ele
    if (safeTamMax) {
      const inflightKey = `${idTarget}_s${safeTamMax}`
      const existingPromise = this.inFlightResizes.get(inflightKey)
      if (existingPromise) {
        return existingPromise
      }

      const resizePromise = this.executeGetAndResize(idTarget, safeTamMax)
      this.inFlightResizes.set(inflightKey, resizePromise)

      try {
        return await resizePromise
      } finally {
        this.inFlightResizes.delete(inflightKey)
      }
    }

    return this.executeGetAndResize(idTarget, null)
  }

  /**
   * Executa a busca do buffer original e opcional redimensionamento
   */
  private static async executeGetAndResize(
    idTarget: number,
    safeTamMax: number | null
  ): Promise<string | null> {
    // 1. Busca o buffer original em disco
    let originalBuffer: Buffer | null = null
    const originalFile = await this.findOriginalFile(idTarget)

    if (originalFile) {
      try {
        originalBuffer = await fs.readFile(originalFile)
      } catch (err: any) {
        logger.error(`[ImageStorage] Erro ao ler arquivo ${originalFile}: ${err.message}`)
      }
    }

    // 2. Se não achou no disco, busca no MySQL (migração sob demanda / fallback)
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
        logger.warn(
          `[ImageStorage] Registro marcado como ${dbImagem} mas não encontrado em disco para target ${idTarget}`
        )
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
          await this.atomicWriteFile(filePath, originalBuffer)

          // Atualiza o banco para desocupar memória do MySQL
          record.imagem = `disk:${filename}`
          await record.save()
          logger.info(`[ImageStorage] Migrado sob demanda do MySQL para disco: target ${idTarget} -> ${filename}`)
        } else {
          return ' '
        }
      } catch (err: any) {
        logger.error(`[ImageStorage] Falha ao processar Base64 do banco para target ${idTarget}: ${err.message}`)
        return ' '
      }
    }

    if (!originalBuffer || originalBuffer.length === 0) {
      return ' '
    }

    // 3. Se não precisa de redimensionamento, retorna o Base64 original
    if (!safeTamMax) {
      return originalBuffer.toString('base64')
    }

    // 4. Redimensiona com Sharp e grava no cache atômico
    try {
      return await this.resizeAndCache(idTarget, originalBuffer, safeTamMax)
    } catch (err: any) {
      logger.error(`[ImageStorage] Falha no redimensionamento Sharp para target ${idTarget}: ${err.message}`)
      return originalBuffer.toString('base64')
    }
  }

  /**
   * Resolve o valor para Base64 (usado na listagem index para compatibilidade).
   */
  public static async resolveBase64(
    idTarget: number,
    storedValue: string | null | undefined
  ): Promise<string> {
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
   * Pré-aquece o cache de um target específico para os tamanhos fornecidos.
   * Se o arquivo em disco estiver corrompido, limpa o arquivo para evitar erros contínuos.
   * Se force = false, só gera se o arquivo de cache correspondente não existir.
   */
  public static async warmCacheForTarget(
    idTarget: number,
    sizes: readonly number[] = this.PREWARM_SIZES,
    force = false
  ): Promise<{ targetId: number; generated: number; skipped: number; corrupt: boolean }> {
    await this.ensureDirs()

    const originalFile = await this.findOriginalFile(idTarget)
    if (!originalFile) {
      return { targetId: idTarget, generated: 0, skipped: sizes.length, corrupt: false }
    }

    const buffer = await fs.readFile(originalFile)

    // Valida integridade do arquivo em disco
    let isCorrupted = false
    try {
      const meta = await sharp(buffer).metadata()
      if (!meta.format) {
        isCorrupted = true
      }
    } catch {
      isCorrupted = true
    }

    if (isCorrupted) {
      logger.warn(
        `[ImageStorage] Arquivo corrompido detectado para target ${idTarget} (${originalFile}). Removendo...`
      )
      await this.deleteTargetImage(idTarget)
      return { targetId: idTarget, generated: 0, skipped: 0, corrupt: true }
    }

    let generated = 0
    let skipped = 0

    for (const size of sizes) {
      const cacheFile = path.join(this.getCacheDir(), `target_${idTarget}_s${size}.cache`)
      if (!force) {
        try {
          const stat = await fs.stat(cacheFile)
          if (stat.size > 0) {
            skipped++
            continue
          }
        } catch {}
      }

      await this.resizeAndCache(idTarget, buffer, size)
      generated++
    }

    return { targetId: idTarget, generated, skipped, corrupt: false }
  }

  /**
   * Varre todas as imagens originais existentes no disco e garante que os caches (100 e 200) estejam gerados.
   * Detecta e remove arquivos corrompidos automaticamente.
   */
  public static async warmAllCaches(
    sizes: readonly number[] = this.PREWARM_SIZES,
    force = false,
    onProgress?: (current: number, total: number, targetId: number, generated: number, corrupt: boolean) => void
  ): Promise<{
    total: number
    warmedTargets: number
    generatedFiles: number
    skippedFiles: number
    corruptCleaned: number
    errors: number
  }> {
    await this.ensureDirs()

    const originalDir = this.getOriginalDir()
    let files: string[] = []
    try {
      files = await fs.readdir(originalDir)
    } catch {
      return { total: 0, warmedTargets: 0, generatedFiles: 0, skippedFiles: 0, corruptCleaned: 0, errors: 0 }
    }

    // Identifica todos os idTargets únicos a partir dos nomes dos arquivos originais (ex: target_123.webp)
    const targetIds = new Set<number>()
    for (const file of files) {
      const match = file.match(/^target_(\d+)\./)
      if (match) {
        targetIds.add(parseInt(match[1], 10))
      }
    }

    const total = targetIds.size
    let current = 0
    let warmedTargets = 0
    let generatedFiles = 0
    let skippedFiles = 0
    let corruptCleaned = 0
    let errors = 0

    for (const targetId of targetIds) {
      current++
      try {
        const result = await this.warmCacheForTarget(targetId, sizes, force)
        if (result.corrupt) {
          corruptCleaned++
        } else if (result.generated > 0) {
          warmedTargets++
          generatedFiles += result.generated
        }
        skippedFiles += result.skipped

        if (onProgress) {
          onProgress(current, total, targetId, result.generated, result.corrupt)
        }
      } catch (err: any) {
        errors++
        logger.error(`[ImageStorage] Erro ao aquecer cache para target ${targetId}: ${err.message}`)
      }
    }

    return { total, warmedTargets, generatedFiles, skippedFiles, corruptCleaned, errors }
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
      } catch (err: any) {
        errors++
        logger.error(`[ImageStorage] Erro ao migrar imagem do target ${record.idTarget}: ${err.message}`)
      }
    }

    return { total, migrated, errors }
  }
}
