import Route from '@ioc:Adonis/Core/Route'

Route.post('/login', 'AuthController.login')

Route.group(() => {
    Route.get("auth/me","AuthController.me");
    Route.get('/all','TargetsController.all');
    Route.get('/allAtive','TargetsController.allAtive');
    Route.get('/target/:id','TargetsController.index')
    Route.get('/image/:id','TargetsController.image')
    Route.resource('/target','TargetsController').only(['store','update','destroy']);
    Route.get('/historic','HistoricsController.get')
    Route.post('/inside','HistoricsController.inside')
    Route.get('/deposit/:id','DepositsController.get')
    Route.get('/sumdeposit/:id','DepositsController.getSum')
    Route.get('/allCoin','CoinsController.allCoin')
    Route.post('/storeCoin','CoinsController.storeCoin')
}).middleware("auth")