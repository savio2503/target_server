import ImagemTarget from '#models/imagem_target'
import type { HttpContext } from '@adonisjs/core/http'

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
            updatedAt: imagem.updatedAt.setZone('local').toFormat('dd/MM/yyyy HH:mm'),
        }

        return response.ok(formattedImagem)
    }

    public async showImage({ params, response }: HttpContext) {
        const { idTarget } = params
        const imagem = await ImagemTarget.query()
            .where('idTarget', idTarget)
            .select('imagem')
            .first()

        if (!imagem) {
            return response.notFound({ message: 'Imagem não encontrada para o idTarget fornecido.' })
        }

        return response.ok(imagem)
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