import { schema, rules, CustomMessages } from '@ioc:Adonis/Core/Validator'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class CreateEditTargetValidator {
  constructor(protected ctx: HttpContextContract) { }

  public schema = schema.create({
    descricao: schema.string({ trim: true }, [rules.maxLength(255)]),
    valor: schema.number(),
    posicao: schema.number(),
    imagem: schema.string({ trim: true }),
    coin: schema.number()
  })

  public messages: CustomMessages = {
    required: '{{ field }} campo é obrigatório',
    'descricao.required': 'É necessário que o campo {{ field }} seja preenchido',
    'valor.required': 'É necessário que o campo {{ field }} seja preenchido',
    'posicao.required': 'É necessário que o campo {{ field }} seja preenchido',
    'coin.required': 'É necessário que o campo {{ field }} seja preenchido',
  }
}
