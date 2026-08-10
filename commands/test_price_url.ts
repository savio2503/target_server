import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import PriceAgentService from '#services/price_agent_service'
import PriceStrategy from '#models/price_strategy'

export default class TestPriceUrl extends BaseCommand {
  static commandName = 'test:price-url'
  static description = 'Testa a extração de preço de uma URL específica, sem precisar de um target no banco'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'URL do produto a testar' })
  declare url: string

  @flags.string({ description: 'Descrição do produto (ajuda o fallback via LLM)' })
  declare descricao?: string

  @flags.boolean({ description: 'Mostra diagnóstico do HTML bruto recebido (sem rodar as camadas de extração)' })
  declare debug?: boolean

  @flags.boolean({
    description: 'Apaga o cache de estratégia (price_strategies) desse domínio antes de testar',
  })
  declare resetCache?: boolean

  @flags.string({
    description: 'Busca um texto/regex no HTML bruto e mostra o contexto ao redor (debug)',
  })
  declare grep?: string

  async run() {
    this.logger.info(`Testando URL: ${this.url}`)

    if (this.resetCache) {
      const domain = new URL(this.url).hostname.replace(/^www\./, '')
      const deleted = await PriceStrategy.query().where('domain', domain).delete()
      this.logger.info(`Cache de estratégia removido para "${domain}" (${deleted} registro(s))`)
    }

    if (this.grep) {
      const info = await PriceAgentService.debugGrep(this.url, this.grep)
      this.logger.info(`Status HTTP: ${info.status} | HTML: ${info.htmlLength} caracteres`)
      this.logger.info(`Ocorrências de "${this.grep}": ${info.occurrences}`)
      info.matches.forEach((m, i) => {
        this.logger.info(`--- ocorrência ${i + 1} (posição ${m.index}) ---`)
        this.logger.info(m.context.replace(/\s+/g, ' ').trim())
      })
      return
    }

    if (this.debug) {
      const info = await PriceAgentService.debugFetch(this.url)
      this.logger.info(`Status HTTP: ${info.status}`)
      this.logger.info(`Tamanho do HTML: ${info.htmlLength} caracteres`)
      this.logger.info(`Título da página: "${info.titleTag}"`)
      this.logger.info(`Contém "R$" no texto: ${info.containsReais}`)
      this.logger.info(`Contém "pix" no texto: ${info.containsPix}`)
      this.logger.info(`Match do regex "R$ ... no pix": ${info.pixMatch ?? '(nenhum)'}`)
      this.logger.info(`Trecho do body: ${info.bodyTextSnippet}`)
      return
    }

    const result = await PriceAgentService.getPrice(this.url, this.descricao)

    if (result.price === null) {
      this.logger.warning(`Não foi possível obter o preço (domínio: ${result.domain})`)
      return
    }

    this.logger.success(
      `Preço encontrado: R$ ${result.price} | estratégia: ${result.strategy} | domínio: ${result.domain}`
    )
  }
}
