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
import ImagemTargetsController from '#controllers/imagem_targets_controller'

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.post('/login',     [AuthController, 'login'])
router.post('/signin',     [AuthController, 'signin'])
router.get('/allCoin',    [CoinsController, 'allCoin'])
router.post('/storeCoin', [CoinsController, 'storeCoin'])

router.group(() => {
  router.resource('/target',TargetsController).only(['store','update','destroy'])
  router.put('/comprar/:id/:comprado', [TargetsController, 'comprar'])
  router.get('/all',            [TargetsController,   'all'])
  router.get('/target/:id',     [TargetsController,   'index'])
  router.get('/image/:id',      [TargetsController,   'image'])
  router.put('/image',          [TargetsController,   'imageUpdate'])
  router.get('auth/me',         [AuthController,      'me'])
  router.get('/historic',       [HistoricsController, 'get'])
  router.post('/inside',        [HistoricsController, 'inside'])
  router.get('/deposit/:id',    [DepositsController,  'get'])
  router.get('/sumdeposit/:id', [DepositsController,  'getSum'])

  router.get('/imagens', [ImagemTargetsController, 'index']) // 1 - Pegar todas as imagens

  router.get('/imagens/:idTarget/details', [ImagemTargetsController, 'showDetails']) // 2.1 - ID e updatedAt
  router.get('/imagens/:idTarget/image', [ImagemTargetsController, 'showImage'])     // 2.2 - Apenas imagem

  router.put('/imagens/:idTarget', [ImagemTargetsController, 'update']) // 3 - Atualizar imagem
}).use(middleware.auth())