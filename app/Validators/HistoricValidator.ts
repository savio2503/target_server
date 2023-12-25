import { schema, CustomMessages } from '@ioc:Adonis/Core/Validator'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'

export default class HistoricValidator {
  constructor(protected ctx: HttpContextContract) {}

  public schema = schema.create({
    valor: schema.number(),
  })

  public messages: CustomMessages = {
    required: '{{ field }} campo é obrigatório',
    'valor.required': 'O {{ field }} tem que ser preechido'
  }
}
