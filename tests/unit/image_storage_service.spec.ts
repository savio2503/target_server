import { test } from '@japa/runner'
import sharp from 'sharp'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import ImageStorageService from '#services/image_storage_service'
import ImageConverter from '../../app/helpers/ImageConverter.js'

test.group('ImageStorageService', (group) => {
  let tempStorageDir: string

  group.setup(async () => {
    tempStorageDir = path.join(os.tmpdir(), `api_target_test_${Date.now()}`)
    await fs.mkdir(tempStorageDir, { recursive: true })
    ImageStorageService.setStorageDir(tempStorageDir)
  })

  group.teardown(async () => {
    ImageStorageService.setStorageDir(null)
    await fs.rm(tempStorageDir, { recursive: true, force: true })
  })

  test('ImageConverter.compressBase64 deve preservar URLs intactas sem corromper bytes', async ({
    assert,
  }) => {
    const sampleUrl = 'https://upload.wikimedia.org/wikipedia/en/b/b9/Exodus_key_art.jpg'
    const result = await ImageConverter.compressBase64(sampleUrl)
    assert.equal(result, sampleUrl)
  })

  test('ImageStorageService.saveTargetImage deve rejeitar dados de imagem inválidos ou corrompidos', async ({
    assert,
  }) => {
    const corruptBase64 = Buffer.from('this is not an image at all').toString('base64')
    await assert.rejects(async () => {
      await ImageStorageService.saveTargetImage(888888, corruptBase64)
    })
  })

  test('warmCacheForTarget deve detectar e limpar arquivo original corrompido em disco', async ({
    assert,
  }) => {
    const corruptTargetId = 777777
    const originalDir = ImageStorageService.getOriginalDir()
    await fs.mkdir(originalDir, { recursive: true })

    // Cria arquivo corrupto contendo apenas texto ASCII
    const corruptFile = path.join(originalDir, `target_${corruptTargetId}.webp`)
    await fs.writeFile(corruptFile, 'invalid garbage content')

    const result = await ImageStorageService.warmCacheForTarget(corruptTargetId)
    assert.isTrue(result.corrupt, 'Deve marcar como corrompido')

    // O arquivo corrompido deve ter sido excluído do disco
    const stillExists = await fs.stat(corruptFile).then(() => true).catch(() => false)
    assert.isFalse(stillExists, 'Arquivo corrompido deve ter sido removido do disco')
  })

  test('deve salvar imagem no disco, pré-aquecer cache (100 e 200) síncrono e limpar corretamente', async ({
    assert,
  }) => {
    const testTargetId = 999999

    // Cria uma imagem de teste 300x300 em memória
    const sampleBuffer = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer()

    const sampleBase64 = sampleBuffer.toString('base64')

    // 1. Salvar imagem no disco
    const marker = await ImageStorageService.saveTargetImage(testTargetId, sampleBase64)
    assert.isTrue(marker.startsWith('disk:target_999999.'))

    // 2. Verifica que o arquivo físico existe no diretório original
    const originalDir = ImageStorageService.getOriginalDir()
    const files = await fs.readdir(originalDir)
    assert.isTrue(files.some((f) => f.startsWith(`target_${testTargetId}.`)))

    // 3. Verifica que os arquivos de cache padrão (100 e 200) já foram criados IMEDIATAMENTE no salvamento
    const cacheDir = ImageStorageService.getCacheDir()
    const cache100 = path.join(cacheDir, `target_${testTargetId}_s100.cache`)
    const cache200 = path.join(cacheDir, `target_${testTargetId}_s200.cache`)

    const exists100 = await fs.stat(cache100).then(() => true).catch(() => false)
    const exists200 = await fs.stat(cache200).then(() => true).catch(() => false)
    assert.isTrue(exists100, 'Cache de tamanho 100 deve ter sido pré-gerado')
    assert.isTrue(exists200, 'Cache de tamanho 200 deve ter sido pré-gerado')

    // 4. Buscar imagem com tamMax=100 (deve vir do cache pré-aquecido)
    const fromCache100 = await ImageStorageService.getTargetImage(testTargetId, 100)
    assert.isNotNull(fromCache100)
    const fileContent100 = await fs.readFile(cache100, 'utf-8')
    assert.equal(fromCache100, fileContent100)

    // 5. Buscar com redimensionamento sob demanda tamMax=50 (deve gerar cache atômico)
    const resized50 = await ImageStorageService.getTargetImage(testTargetId, 50)
    assert.isNotNull(resized50)
    const cache50 = path.join(cacheDir, `target_${testTargetId}_s50.cache`)
    const exists50 = await fs.stat(cache50).then(() => true).catch(() => false)
    assert.isTrue(exists50)

    // 6. Testar warmAllCaches
    const warmResult = await ImageStorageService.warmAllCaches()
    assert.isTrue(warmResult.total >= 1)
    assert.equal(warmResult.errors, 0)

    // 7. Exclusão deve remover arquivo físico e todos os caches
    await ImageStorageService.deleteTargetImage(testTargetId)

    const filesAfterDelete = await fs.readdir(originalDir)
    assert.isFalse(filesAfterDelete.some((f) => f.startsWith(`target_${testTargetId}.`)))

    const exists100After = await fs.stat(cache100).then(() => true).catch(() => false)
    const exists200After = await fs.stat(cache200).then(() => true).catch(() => false)
    const exists50After = await fs.stat(cache50).then(() => true).catch(() => false)
    assert.isFalse(exists100After)
    assert.isFalse(exists200After)
    assert.isFalse(exists50After)
  })
})
