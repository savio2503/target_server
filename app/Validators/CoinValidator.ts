import { schema, rules, CustomMessages } from '@ioc:Adonis/Core/Validator'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class CoinValidator {
  constructor(protected ctx: HttpContextContract) { }

  public schema = schema.create({
    name: schema.string({ trim: true }),
    symbol: schema.string({ trim: true }, [rules.maxLength(3)])
  })

  public messages: CustomMessages = {
    required: '{{ field }} campo é obrigatório',
    'name.required': 'É necessário que o campo {{ field }} seja preenchido',
    'symbol.required': 'É necessário que o campo {{ field }} seja preenchido',
    'symbol.maxLength': 'O {{ field }} deve ter o tamanho igual ou menor a 3',
  }
}
