import Coin from '#models/coin'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    // Write your database queries inside the run method
    await Coin.create({
      name: 'Real',
      symbol: 'R$'
    })
    await Coin.create({
      name: 'Dolar',
      symbol: 'U$'
    })
  }
}