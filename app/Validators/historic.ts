import vine from '@vinejs/vine'

export const historicValidator = vine.compile(
    vine.object({
        valor: vine.number()
    })
)