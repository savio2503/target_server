import vine from '@vinejs/vine'

export const coinValidator = vine.compile(
    vine.object({
        name: vine.string().trim(),
        symbol: vine.string()
    })
) 