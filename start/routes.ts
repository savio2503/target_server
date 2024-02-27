/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import AuthController from '#controllers/auth_controller'
import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'
import TargetsController from '#controllers/targets_controller'
import CoinsController from '#controllers/coins_controller'
import HistoricsController from '#controllers/historics_controller'
import DepositsController from '#controllers/deposits_controller'

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.post('/login',     [AuthController, 'login'])
router.get('/allCoin',    [CoinsController, 'allCoin'])
router.post('/storeCoin', [CoinsController, 'storeCoin'])

router.group(() => {
  router.resource('/target',TargetsController).only(['store','update','destroy'])
  router.get('/all',            [TargetsController,   'all'])
  router.get('/target/:id',     [TargetsController,   'index'])
  router.get('/image/:id',      [TargetsController,   'image'])
  router.put('/image',          [TargetsController,   'imageUpdate'])
  router.get('auth/me',         [AuthController,      'me'])
  router.get('/historic',       [HistoricsController, 'get'])
  router.post('/inside',        [HistoricsController, 'inside'])
  router.get('/deposit/:id',    [DepositsController,  'get'])
  router.get('/sumdeposit/:id', [DepositsController,  'getSum'])
}).use(middleware.auth())