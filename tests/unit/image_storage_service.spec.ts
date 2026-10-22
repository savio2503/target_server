import { test } from '@japa/runner'
import sharp from 'sharp'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ImageStorageService from '#services/image_storage_service'

test.group('ImageStorageService', () => {
  test('deve salvar imagem no disco, redimensionar em cache e limpar corretamente', async ({ assert }) => {
    const testTargetId = 999999

    // Cria uma imagem simples 100x100 em memória
    const sampleBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
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

    // Verifica que o arquivo físico existe no diretório original
    const originalDir = ImageStorageService.getOriginalDir()
    const files = await fs.readdir(originalDir)
    assert.isTrue(files.some((f) => f.startsWith(`target_${testTargetId}.`)))

    // 2. Buscar imagem sem redimensionamento
    const fetchedBase64 = await ImageStorageService.getTargetImage(testTargetId)
    assert.isNotNull(fetchedBase64)
    assert.isTrue(fetchedBase64!.length > 0)

    // 3. Buscar com redimensionamento tamMax=50 (deve gerar cache)
    const resizedBase64 = await ImageStorageService.getTargetImage(testTargetId, 50)
    assert.isNotNull(resizedBase64)

    // Verifica que o arquivo de cache foi gravado
    const cacheDir = ImageStorageService.getCacheDir()
    const cacheFile = path.join(cacheDir, `target_${testTargetId}_s50.cache`)
    const cacheExists = await fs
      .stat(cacheFile)
      .then(() => true)
      .catch(() => false)
    assert.isTrue(cacheExists)

    // 4. Buscar novamente com tamMax=50 (cache hit)
    const fromCacheBase64 = await ImageStorageService.getTargetImage(testTargetId, 50)
    assert.equal(fromCacheBase64, resizedBase64)

    // 5. Exclusão deve remover arquivos físicos e cache
    await ImageStorageService.deleteTargetImage(testTargetId)

    const filesAfterDelete = await fs.readdir(originalDir)
    assert.isFalse(filesAfterDelete.some((f) => f.startsWith(`target_${testTargetId}.`)))

    const cacheAfterDelete = await fs
      .stat(cacheFile)
      .then(() => true)
      .catch(() => false)
    assert.isFalse(cacheAfterDelete)
  })
})
