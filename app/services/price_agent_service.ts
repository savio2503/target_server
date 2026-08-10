import axios from 'axios'
import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import PriceStrategy, { type PriceStrategyName } from '#models/price_strategy'

export interface PriceResult {
  price: number | null
  strategy: PriceStrategyName | 'none'
  domain: string
}

type Adapter = ($: cheerio.CheerioAPI) => string | null | undefined

/**
 * Camada 1 - Adapters conhecidos (o que já existia no command original).
 * Rápido, gratuito e preciso quando o site não muda o layout.
 * Adicione novos sites aqui conforme forem sendo mapeados manualmente.
 */
const KNOWN_ADAPTERS: Record<string, Adapter> = {
  'kabum.com.br': ($) => $('h4[data-testid="price-value"]').text().trim(),
  'aliexpress.com': ($) => $('div.product-price-current').text().trim(),
  'mercadolivre.com': ($) => $('span.andes-money-amount__fraction').first().text().trim(),
  'mercadolibre.com': ($) => $('span.andes-money-amount__fraction').first().text().trim(),
  'amazon.com': ($) =>
    $('#priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen').first().text().trim(),
  'amazon.com.br': ($) => {
    // Livros na Amazon mostram vários formatos (Capa comum, Capa dura,
    // Kindle...) como opções lado a lado, cada uma com seu próprio preço.
    // O nome do formato fica no atributo "title" do link de cada opção.
    const paperback = $('#mm-grid-aod-popover-paperback_meta_binding-entry')

    if (paperback.length) {
      const text = [
        paperback.attr('aria-label') ?? '',
        paperback.text(),
      ].join(' ')

      const match = text.match(/R\$\s*[\d.,]+/)

      if (match) {
        return match[0]
      }
    }

    // Não é livro (ou não achou o formato "Capa comum"): usa o bloco de
    // preço padrão de produto normal.
    return $('#priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen')
      .first()
      .text()
      .trim()
  },
  'goimports.com.br': ($) => {
    const match = $('body')
      .text()
      .match(/R\$\s*[\d.,]+\s*no pix/i)
    return match ? match[0] : null
  },
}

const HTTP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

export default class PriceAgentService {
  /**
   * Ponto de entrada principal do agente. Recebe a URL do produto e
   * devolve o preço encontrado + qual estratégia foi usada, para logging
   * e para alimentar o cache de estratégias por domínio.
   */
  static async getPrice(url: string, descricao?: string): Promise<PriceResult> {
    const domain = this.extractDomain(url)

    // Steam tem uma API pública oficial de detalhes de app - muito mais
    // confiável que fazer scraping da página, porque o preço em BRL só
    // aparece corretamente com base no país (a página em si mostra preço
    // em USD por padrão, já que a Steam decide moeda pelo IP/geolocalização).
    if (domain.includes('steampowered.com')) {
      const steamPrice = await this.trySteamApi(url)
      if (steamPrice !== null) {
        await this.registerAttempt(domain, 'api', true, steamPrice)
        return { price: steamPrice, strategy: 'api', domain }
      }
      logger.warn(
        `[PriceAgent] Steam API não retornou preço para ${url}, tentando scraping normal`
      )
    }

    let html: string
    try {
      const { data } = await axios.get<string>(url, {
        headers: HTTP_HEADERS,
        timeout: 15000,
      })
      html = data
    } catch (error) {
      logger.error(`[PriceAgent] falha ao baixar ${url}: ${error.message}`)
      await this.registerAttempt(domain, 'adapter', false)
      return { price: null, strategy: 'none', domain }
    }

    const $ = cheerio.load(html)

    const cached = await PriceStrategy.findBy('domain', domain)

    // Se já sabemos que esse domínio só é resolvido via LLM, pula direto
    // pra economizar tentativas (e chamadas de rede) que sabemos que vão falhar.
    if (cached?.strategy === 'llm') {
      const price = await this.tryLLM($, url, descricao)
      await this.registerAttempt(domain, 'llm', price !== null, price)
      return { price, strategy: 'llm', domain }
    }

    // Camada 1: adapter conhecido para o domínio
    const adapterPrice = this.tryKnownAdapter($, domain)
    if (adapterPrice !== null) {
      await this.registerAttempt(domain, 'adapter', true, adapterPrice)
      return { price: adapterPrice, strategy: 'adapter', domain }
    }

    // Camada 2: dados estruturados que o próprio site expõe para SEO
    const jsonLdPrice = this.tryJsonLd($)
    if (jsonLdPrice !== null) {
      await this.registerAttempt(domain, 'jsonld', true, jsonLdPrice)
      return { price: jsonLdPrice, strategy: 'jsonld', domain }
    }

    const ogPrice = this.tryOpenGraph($)
    if (ogPrice !== null) {
      await this.registerAttempt(domain, 'opengraph', true, ogPrice)
      return { price: ogPrice, strategy: 'opengraph', domain }
    }

    const microdataPrice = this.tryMicrodata($)
    if (microdataPrice !== null) {
      await this.registerAttempt(domain, 'microdata', true, microdataPrice)
      return { price: microdataPrice, strategy: 'microdata', domain }
    }

    // Camada 3: fallback via LLM, generaliza pra qualquer site novo
    const llmPrice = await this.tryLLM($, url, descricao)
    await this.registerAttempt(domain, 'llm', llmPrice !== null, llmPrice)

    return { price: llmPrice, strategy: llmPrice !== null ? 'llm' : 'none', domain }
  }

  /**
   * Utilitário de debug: baixa a URL com os mesmos headers usados em
   * getPrice() e devolve diagnósticos, sem rodar as camadas de extração.
   * Ajuda a descobrir se o problema é regex/seletor ou se o site não
   * entrega o preço no HTML estático (ex: preço carregado via JS).
   */
  static async debugFetch(url: string) {
    const { data: html, status } = await axios.get<string>(url, {
      headers: HTTP_HEADERS,
      timeout: 15000,
      validateStatus: () => true,
    })

    const $ = cheerio.load(html)
    const bodyText = $('body').text()

    return {
      status,
      htmlLength: html.length,
      containsReais: /R\$/.test(bodyText),
      containsPix: /pix/i.test(bodyText),
      pixMatch: bodyText.match(/R\$\s*[\d.,]+\s*no pix/i)?.[0] ?? null,
      bodyTextSnippet: bodyText.replace(/\s+/g, ' ').trim().slice(0, 500),
      titleTag: $('title').text().trim(),
    }
  }

  /**
   * Consulta a API pública appdetails da Steam (não documentada oficialmente,
   * mas estável e amplamente usada). Passa cc=br para pegar o preço em reais
   * já convertido pela própria Steam, e l=portuguese pro texto vir em pt-BR.
   */
  private static async trySteamApi(url: string): Promise<number | null> {
    const appId = url.match(/\/app\/(\d+)/)?.[1]
    if (!appId) return null

    try {
      const { data } = await axios.get(
        'https://store.steampowered.com/api/appdetails',
        {
          params: { appids: appId, cc: 'br', l: 'portuguese' },
          headers: HTTP_HEADERS,
          timeout: 15000,
        }
      )

      const entry = data?.[appId]
      if (!entry?.success) return null

      if (entry.data?.is_free) return 0

      // "final" vem em centavos (ex: 3379 = R$ 33,79). Já é o preço com
      // desconto aplicado, quando o jogo está em promoção.
      const priceOverview = entry.data?.price_overview
      if (!priceOverview || typeof priceOverview.final !== 'number') return null

      return priceOverview.final / 100
    } catch (error) {
      logger.warn(`[PriceAgent] Steam API falhou para appid ${appId}: ${error.message}`)
      return null
    }
  }

  /**
   * Utilitário de debug genérico: baixa a URL e procura por um texto/regex
   * no HTML bruto, devolvendo um trecho de contexto ao redor de cada
   * ocorrência. Útil pra descobrir a estrutura real de um site sem
   * precisar de acesso manual ao "inspecionar elemento".
   */
  static async debugGrep(url: string, pattern: string, contextChars = 200) {
    const { data: html, status } = await axios.get<string>(url, {
      headers: HTTP_HEADERS,
      timeout: 15000,
      validateStatus: () => true,
    })

    const regex = new RegExp(pattern, 'gi')
    const matches: { index: number; context: string }[] = []

    let match: RegExpExecArray | null
    while ((match = regex.exec(html)) !== null && matches.length < 10) {
      const start = Math.max(0, match.index - contextChars)
      const end = Math.min(html.length, match.index + match[0].length + contextChars)
      matches.push({ index: match.index, context: html.slice(start, end) })

      // Evita loop infinito em regex que não avança (ex: padrão vazio)
      if (match[0].length === 0) regex.lastIndex++
    }

    return { status, htmlLength: html.length, occurrences: matches.length, matches }
  }

  private static extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  }

  private static tryKnownAdapter($: cheerio.CheerioAPI, domain: string): number | null {
    // Usa o match mais específico (mais longo) quando várias chaves batem
    // com o domínio (ex: "amazon.com.br" também contém "amazon.com").
    const adapterKey = Object.keys(KNOWN_ADAPTERS)
      .filter((key) => domain.includes(key))
      .sort((a, b) => b.length - a.length)[0]
    if (!adapterKey) return null

    try {
      const text = KNOWN_ADAPTERS[adapterKey]($)
      return this.parsePrice(text)
    } catch (error) {
      logger.warn(`[PriceAgent] adapter falhou para ${domain}: ${error.message}`)
      return null
    }
  }

  /** Extrai preço de blocos <script type="application/ld+json"> (schema.org Product/Offer) */
  private static tryJsonLd($: cheerio.CheerioAPI): number | null {
    const scripts = $('script[type="application/ld+json"]')

    for (const el of scripts.toArray()) {
      const raw = $(el).contents().text()
      if (!raw) continue

      try {
        const parsed = JSON.parse(raw)
        const items = Array.isArray(parsed) ? parsed : [parsed]

        for (const item of items) {
          const price = this.findPriceInObject(item)
          if (price !== null) return price
        }
      } catch {
        // json-ld malformado, ignora e tenta o próximo script
        continue
      }
    }

    return null
  }

  /** Busca recursivamente por um campo "price" em objetos schema.org aninhados (offers, @graph, etc) */
  private static findPriceInObject(obj: any, depth = 0): number | null {
    if (!obj || typeof obj !== 'object' || depth > 4) return null

    if (obj.price !== undefined) {
      const price = this.parsePrice(String(obj.price))
      if (price !== null) return price
    }

    if (obj.offers) {
      const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers]
      for (const offer of offers) {
        const price = this.findPriceInObject(offer, depth + 1)
        if (price !== null) return price
      }
    }

    if (obj['@graph']) {
      const graph = Array.isArray(obj['@graph']) ? obj['@graph'] : [obj['@graph']]
      for (const node of graph) {
        const price = this.findPriceInObject(node, depth + 1)
        if (price !== null) return price
      }
    }

    return null
  }

  private static tryOpenGraph($: cheerio.CheerioAPI): number | null {
    const candidates = [
      'meta[property="product:price:amount"]',
      'meta[property="og:price:amount"]',
      'meta[name="twitter:data1"]',
    ]

    for (const selector of candidates) {
      const content = $(selector).attr('content')
      if (content) {
        const price = this.parsePrice(content)
        if (price !== null) return price
      }
    }

    return null
  }

  private static tryMicrodata($: cheerio.CheerioAPI): number | null {
    const el = $('[itemprop="price"]').first()
    if (!el.length) return null

    const value = el.attr('content') ?? el.text()
    return this.parsePrice(value)
  }

  /**
   * Camada 4 - fallback via LLM. Generaliza pra qualquer site sem precisar
   * de seletor nenhum. Envia texto limpo (não o HTML bruto) pra reduzir
   * custo/latência e ruído.
   */
  private static async tryLLM(
    $: cheerio.CheerioAPI,
    url: string,
    descricao?: string
  ): Promise<number | null> {
    const apiKey = env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      logger.warn('[PriceAgent] ANTHROPIC_API_KEY não configurada, pulando fallback via LLM')
      return null
    }

    const context = this.buildCleanContext($)

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system:
            'Você extrai o preço atual (à vista) de uma página de produto de e-commerce brasileiro. ' +
            'Responda APENAS com um JSON válido, sem markdown, sem texto extra, no formato: ' +
            '{"price": number|null, "currency": "BRL", "available": boolean}. ' +
            'Use o menor preço à vista/pix exibido, ignorando preços "de/por" riscados (o "de" é o antigo). ' +
            'Se não encontrar um preço confiável, retorne price: null.',
          messages: [
            {
              role: 'user',
              content:
                `URL: ${url}\n` +
                (descricao ? `Produto esperado: ${descricao}\n` : '') +
                `\nConteúdo da página:\n${context}`,
            },
          ],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          timeout: 20000,
        }
      )

      const textBlock = response.data?.content?.find((c: any) => c.type === 'text')
      if (!textBlock?.text) return null

      const cleaned = textBlock.text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      if (parsed.price === null || parsed.price === undefined) return null

      const price = Number(parsed.price)
      return Number.isFinite(price) ? price : null
    } catch (error) {
      logger.error(`[PriceAgent] fallback LLM falhou: ${error.message}`)
      return null
    }
  }

  /** Reduz a página a um texto enxuto (título + meta + corpo) pra economizar tokens */
  private static buildCleanContext($: cheerio.CheerioAPI): string {
    $('script, style, svg, noscript, iframe, header, footer, nav').remove()

    const title = $('title').text().trim()
    const metaDescription = $('meta[name="description"]').attr('content') ?? ''
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()

    const MAX_CHARS = 8000
    const truncatedBody =
      bodyText.length > MAX_CHARS ? bodyText.slice(0, MAX_CHARS) + '...' : bodyText

    return `Título: ${title}\nDescrição: ${metaDescription}\n\n${truncatedBody}`
  }

  /**
   * Normaliza texto de preço em formato BR ("R$ 1.234,56") ou já numérico
   * ("1234.56", comum em JSON-LD) para um number.
   */
  private static parsePrice(text: string | null | undefined): number | null {
    if (!text) return null

    const cleaned = text.replace(/[^\d.,]/g, '').trim()
    if (!cleaned) return null

    const hasDot = cleaned.includes('.')
    const hasComma = cleaned.includes(',')

    let normalized: string

    if (hasDot && hasComma) {
      // O último separador é o decimal; o outro é separador de milhar.
      const lastDot = cleaned.lastIndexOf('.')
      const lastComma = cleaned.lastIndexOf(',')
      const decimalSeparator = lastDot > lastComma ? '.' : ','
      const thousandsSeparator = decimalSeparator === '.' ? ',' : '.'

      normalized = cleaned.split(thousandsSeparator).join('').replace(decimalSeparator, '.')
    } else if (hasComma) {
      // Só vírgula: formato BR, é decimal (ex: "1234,56")
      normalized = cleaned.replace(',', '.')
    } else {
      // Só ponto ou só dígitos: se tiver 3 dígitos após o último ponto,
      // provavelmente é separador de milhar sem centavos (ex: "1.234").
      const parts = cleaned.split('.')
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
        normalized = parts.join('')
      } else {
        normalized = cleaned
      }
    }

    const price = Number.parseFloat(normalized)
    return Number.isNaN(price) ? null : price
  }

  private static async registerAttempt(
    domain: string,
    strategy: PriceStrategyName,
    success: boolean,
    price?: number | null
  ) {
    try {
      const record = await PriceStrategy.firstOrCreate(
        { domain },
        { domain, strategy, successCount: 0, failCount: 0 }
      )

      record.strategy = strategy
      if (success) {
        record.successCount += 1
        record.lastSuccessAt = DateTime.now()
        if (price !== undefined && price !== null) record.lastPrice = price
      } else {
        record.failCount += 1
      }

      await record.save()
    } catch (error) {
      // Cache é best-effort, não pode derrubar a checagem de preço.
      logger.warn(`[PriceAgent] falha ao atualizar cache de estratégia: ${error.message}`)
    }
  }
}
