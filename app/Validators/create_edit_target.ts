import vine from '@vinejs/vine'

export const createEditTargetValidator = vine.compile(
    vine.object({
        descricao: vine.string().trim().maxLength(255),
        valor: vine.number(),
        posicao: vine.number(),
        imagem: vine.string(),
        coin: vine.number()
    })
)