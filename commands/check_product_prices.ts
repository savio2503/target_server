import { BaseCommand } from '@adonisjs/core/ace'
import { runPriceCheck } from '#services/price_check_runner'

export default class CheckProductPrices extends BaseCommand {
  static commandName = 'check:product-prices'
  static description = 'Verifica e atualiza os preços dos produtos cadastrados'

  async run() {
    await runPriceCheck()
  }
}
