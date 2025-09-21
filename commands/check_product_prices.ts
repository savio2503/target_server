import Target from '#models/target'
import { BaseCommand } from '@adonisjs/core/ace'
//import type { CommandOptions } from '@adonisjs/core/types/ace'
import axios from 'axios'
import * as cheerio from 'cheerio'
import logger from '@adonisjs/core/services/logger'

export default class CheckProductPrices extends BaseCommand {
  static commandName = 'check:product-prices'
  static description = 'Verifica e atualiza os preços dos produtos cadastrados'

  //static options: CommandOptions = {}

  async run() {
    logger.info('start from "CheckProductPrices"')

    const products = await Target.all()

    for (const product of products) {
      const url = product.url

      let newPrice: number | null = null

      if (url?.includes('http') && product.ativo === true) {

        logger.info(`O produto: ${product.descricao} tem a URL: ${url}`)

        try {
          if (url.includes('kabum.com.br')) {
            newPrice = await this.getKabumPrice(url)
          } else if (url.includes('aliexpress.com')) {
            newPrice = await this.getAliExpressPrice(url)
          } else if (url.includes('mercadolivre.com')) {
            newPrice = await this.getMercadoLivrePrice(url)
          } else if (url.includes('amazon.com')) {
            newPrice = await this.getAmazonPrice(url)
          }

          if (newPrice !== null && newPrice !== product.valor) {
            product.valor = newPrice
            //await product.save()
            this.logger.info(`Produto atualizado: ${url} - Novo valor: R$ ${newPrice}`)
          }
        } catch (error) {
          this.logger.error(error)
        }
      } else {
        logger.info(`O produto: ${product.descricao} não tem URL válida`)
      }   
      
    }
  }

  private async getKabumPrice(url: string): Promise<number | null> {
    const { data } = await axios.get(url)
    const $ = cheerio.load(data)
    const priceText = $('h4[data-testid="price-value"]').text().trim()

    return this.parsePrice(priceText)
  }

  private async getAliExpressPrice(url: string): Promise<number | null> {
    const { data } = await axios.get(url)
    const $ = cheerio.load(data)
    const priceText = $('div.product-price-current').text().trim()

    return this.parsePrice(priceText)
  }

  private async getMercadoLivrePrice(url: string): Promise<number | null> {
    const { data } = await axios.get(url)
    const $ = cheerio.load(data)
    const priceText = $('span.andes-money-amount__fraction').first().text().trim()

    return this.parsePrice(priceText)
  }

  private async getAmazonPrice(url: string): Promise<number | null> {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    })
    const $ = cheerio.load(data)
    const priceText = $('#priceblock_ourprice, #priceblock_dealprice').text().trim()

    return this.parsePrice(priceText)
  }

  private parsePrice(text: string): number | null {

    logger.info(`parsePrice: ${text}`)

    const cleaned = text.replace(/[^\d,]/g, '').replace(',', '.')
    const price = parseFloat(cleaned)

    logger.info(`parsePrice: ${text}, resultado: ${price}`)

    return isNaN(price) ? null : price
  }
}