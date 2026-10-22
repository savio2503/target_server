import ImagemTarget from '#models/imagem_target'
import Lastupdate from '#models/lastupdate'
import Target from '#models/target'
import ImageStorageService from '#services/image_storage_service'
import RemoveBgService from '#services/remove_bg_service'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

export default class ImagemTargetsController {

    public async index({ auth, response }: HttpContext) {
        const user = await auth.getUserOrFail()
        
        // Retorna apenas imagens dos targets pertencentes ao usuário logado
        const imagens = await ImagemTarget.query()
            .whereIn('idTarget', (query) => {
                query.from('targets').select('id').where('user_id', user.id)
            })

        const resolved = await Promise.all(
            imagens.map(async (item) => ({
                id: item.id,
                idTarget: item.idTarget,
                imagem: await ImageStorageService.resolveBase64(item.idTarget, item.imagem),
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            }))
        )

        return response.ok(resolved)
    }

    public async showDetails({ auth, params, response }: HttpContext) {
        const user = await auth.getUserOrFail()
        const { idTarget } = params

        const target = await Target.query().where('id', idTarget).where('userId', user.id).first()
        if (!target) {
            return response.notFound({ message: 'Target não encontrado ou não pertence ao usuário' })
        }

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

    public async showImage({ auth, params, request, response }: HttpContext) {
        const user = await auth.getUserOrFail()
        const { idTarget } = params
        const tamMax = request.input('tamMax')

        const target = await Target.query().where('id', idTarget).where('userId', user.id).first()
        if (!target) {
            return response.notFound({ message: 'Target não encontrado ou não pertence ao usuário' })
        }

        const imagemBase64 = await ImageStorageService.getTargetImage(target.id, tamMax)

        if (imagemBase64 === null) {
            return response.notFound({ message: 'Imagem não encontrada para o idTarget fornecido.' })
        }

        return response.ok({ imagem: imagemBase64 })
    }

    public async update({ auth, params, request, response }: HttpContext) {
        const user = await auth.getUserOrFail()
        const { idTarget } = params
        const { imagem } = request.only(['imagem'])

        const target = await Target.query().where('id', idTarget).where('userId', user.id).first()
        if (!target) {
            return response.notFound({ message: 'Target não encontrado ou não pertence ao usuário' })
        }

        const targetImagem = await ImagemTarget.findBy('idTarget', idTarget)

        if (!targetImagem) {
            return response.notFound({ message: 'Imagem não encontrada para o idTarget fornecido.' })
        }

        const marker = await ImageStorageService.saveTargetImage(target.id, imagem)
        targetImagem.imagem = marker
        await targetImagem.save()
        
        await Lastupdate.create({
            table: 'imagem',
            action: 'update',
            detail: idTarget.toString(),
            dateUpdate: DateTime.now(),
            user: user.id
        })

        return response.ok({ message: 'Imagem atualizada com sucesso.', data: targetImagem })
    }

    public async removeBackground({ response, request }: HttpContext) {
        const { imagem } = request.only(['imagem'])

        if (!imagem || typeof imagem !== 'string' || imagem.trim() === '') {
            return response.badRequest({ message: 'O campo imagem é obrigatório.' })
        }

        try {
            const resultBase64 = await RemoveBgService.removeBackground(imagem)
            return response.ok({ imagem: resultBase64 })
        } catch (error: any) {
            return response.badRequest({ message: error.message || 'Erro ao processar remoção de fundo.' })
        }
    }
}
