/*
|----------------------------------------------------------
| Routes file
|----------------------------------------------------------
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
import LastUpdatesController from '#controllers/lastupdates_controller'
import {
  authRateLimiter,
  twoFactorResendRateLimiter,
  twoFactorVerifyRateLimiter,
} from '#middleware/auth_rate_limiters'

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.post('/login', [AuthController, 'login']).use(authRateLimiter)
router.post('/signin', [AuthController, 'signin']).use(authRateLimiter)
router.post('/auth/register/cancel', [AuthController, 'cancelRegistration']).use(authRateLimiter)
router.post('/auth/2fa/verify', [AuthController, 'verifyTwoFactor']).use(twoFactorVerifyRateLimiter)
router.post('/auth/2fa/resend', [AuthController, 'resendTwoFactor']).use(twoFactorResendRateLimiter)
router.post('auth/google', [AuthController, 'loginWithGoogle']).use(authRateLimiter)

router.get('/allCoin', [CoinsController, 'allCoin'])
router.post('/storeCoin', [CoinsController, 'storeCoin'])

router.group(() => {
  router.resource('/target', TargetsController).only(['store', 'update', 'destroy'])
  router.post('/target/:id', [TargetsController, 'update'])
  router.put('/comprar/:id/:comprado/:valorCompra', [TargetsController, 'comprar'])
  router.get('/all/:order', [TargetsController, 'all'])
  router.get('/all/:order/since/:lastUpdate/:utc?', [TargetsController, 'allSince'])
  router.get('/target/:id', [TargetsController, 'index'])
  router.get('auth/me', [AuthController, 'me'])
  router.put('/user/avatar', [AuthController, 'updateAvatar'])
  router.post('/user/avatar', [AuthController, 'updateAvatar'])
  router.put('/user/name', [AuthController, 'updateName'])
  router.post('/user/name', [AuthController, 'updateName'])
  router.get('/historic', [HistoricsController, 'get'])
  router.post('/inside', [HistoricsController, 'inside'])
  router.get('/deposit/:id', [DepositsController, 'get'])
  router.get('/sumdeposit/:id', [DepositsController, 'getSum'])
  router.post('/insideTarget', [DepositsController, 'depositForTarget'])

  router.get('/imagens', [ImagemTargetsController, 'index']) // Pegar imagens dos targets do usuário
  router.get('/imagens/:idTarget/details', [ImagemTargetsController, 'showDetails'])
  router.get('/imagens/:idTarget/image', [ImagemTargetsController, 'showImage'])
  router.put('/imagens/:idTarget', [ImagemTargetsController, 'update'])
  router.post('/imagens/remove-background', [ImagemTargetsController, 'removeBackground'])

  router.get('/lastupdates/:date/:utc?', [LastUpdatesController, 'listAfterDate'])
  router.get('/reset/:id', [DepositsController, 'reset'])
}).use(middleware.auth())
