import ImagemTarget from '#models/imagem_target'
import type { HttpContext } from '@adonisjs/core/http'
import sharp from 'sharp'

export default class ImagemTargetsController {

    public async index({ response }: HttpContext) {
        const imagens = await ImagemTarget.all()
        return response.ok(imagens)
    }

    public async showDetails({ params, response }: HttpContext) {
        const { idTarget } = params
        const imagem = await ImagemTarget.query()
            .where('idTarget', idTarget)
            .select('id', 'updated_at')
            .first()

        if (!imagem) {
            return response.notFound({ message: 'Imagem nao encontrada' })
        }

        const formattedImagem = {
            id: imagem.id,
            updatedAt: imagem.updatedAt.setZone('local').toFormat('dd/MM/yyyy HH:mm:ss'),
        }

        return response.ok(formattedImagem)
    }

    public async showImage({ params, request, response }: HttpContext) {
        const { idTarget } = params
        const tamMax = request.input('tamMax')

        const imagemRecord = await ImagemTarget.query()
            .where('idTarget', idTarget)
            .select('imagem')
            .first()

        if (!imagemRecord) {
            return response.notFound({ message: 'Imagem não encontrada para o idTarget fornecido.' })
        }

        const imagemBase64 = imagemRecord.imagem

        if (imagemBase64.toLowerCase().startsWith('http') || imagemBase64.startsWith(' ')) {
            return response.ok({ imagem: imagemBase64 })
        }

        if (!tamMax) {
            return response.ok({ imagem: imagemBase64 })
        }

        try {

            const buffer = Buffer.from(imagemBase64, 'base64')
            const imagemRedimensionada = await sharp(buffer)
            .resize({
                width: parseInt(tamMax),
                height: parseInt(tamMax),
                fit: 'inside',
                withoutEnlargement: true
            })
            .toBuffer()

            const imagemRedimensionadaBase64 = imagemRedimensionada.toString('base64')
            return response.ok({ imagem: imagemRedimensionadaBase64 })

        } catch(error) {
            console.error('Error ao redimensionar imagem: ', error)
            return response.status(500).send({message: 'Erro ao processar a imagem.'})
        }
    }

    public async update({ params, request, response }: HttpContext) {
        const { idTarget } = params
        const { imagem } = request.only(['imagem'])

        const targetImagem = await ImagemTarget.findBy('idTarget', idTarget)

        if (!targetImagem) {
            return response.notFound({ message: 'Imagem não encontrada para o idTarget fornecido.' })
        }

        targetImagem.imagem = imagem
        await targetImagem.save()

        return response.ok({ message: 'Imagem atualizada com sucesso.', data: targetImagem })
    }
}