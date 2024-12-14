import vine from '@vinejs/vine'

export const editImageValidator = vine.compile(
    vine.object({
        targetId: vine.number(),
        imagem: vine.string()
    })
)