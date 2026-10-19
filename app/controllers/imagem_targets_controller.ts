import ImagemTarget from '#models/imagem_target'
import Lastupdate from '#models/lastupdate'
import Target from '#models/target'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import sharp from 'sharp'

export default class ImagemTargetsController {

    public async index({ auth, response }: HttpContext) {
        const user = await auth.getUserOrFail()
        
        // Retorna apenas imagens dos targets pertencentes ao usuário logado
        const imagens = await ImagemTarget.query()
            .whereIn('idTarget', (query) => {
                query.from('targets').select('id').where('user_id', user.id)
            })

        return response.ok(imagens)
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

        const imagemRecord = await ImagemTarget.query()
            .where('idTarget', idTarget)
            .select('imagem')
            .first()

        if (!imagemRecord) {
            return response.notFound({ message: 'Imagem não encontrada para o idTarget fornecido.' })
        }

        let imagemBase64 = imagemRecord.imagem

        if (imagemBase64.toLowerCase().startsWith('http') || imagemBase64.startsWith(' ')) {
            return response.ok({ imagem: imagemBase64 })
        }

        const match = imagemBase64.match(/^data:image\/[a-zA-Z0-9.+]+;base64,(.+)$/)
        if (match) {
            imagemBase64 = match[1]
        }

        if (!tamMax) {
            return response.ok({ imagem: imagemBase64 })
        }

        try {
            const parsedTamMax = parseInt(tamMax)
            const safeTamMax = Math.min(Math.max(parsedTamMax, 16), 2048) // Limite seguro para evitar DoS de memória

            const buffer = Buffer.from(imagemBase64, 'base64')
            const imagemRedimensionada = await sharp(buffer)
            .resize({
                width: safeTamMax,
                height: safeTamMax,
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

        targetImagem.imagem = imagem
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
}
