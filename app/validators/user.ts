import vine from '@vinejs/vine'

export const userValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email(),
        password: vine.string().trim().minLength(8),
        name: vine.string().trim().optional(),
        avatar: vine.string().trim().optional(),
    })
)

export const avatarUpdateValidator = vine.compile(
    vine.object({
        avatar: vine.string().trim().minLength(1),
    })
)

export const twoFactorVerifyValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email(),
        code: vine.string().trim().fixedLength(6),
    })
)

export const twoFactorResendValidator = vine.compile(
    vine.object({
        email: vine.string().trim().email(),
    })
)