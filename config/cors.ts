import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

const allowedOriginsRaw = env.get('CORS_ALLOWED_ORIGINS')
const originConfig = allowedOriginsRaw
  ? allowedOriginsRaw.split(',').map((o: string) => o.trim()).filter(Boolean)
  : env.get('NODE_ENV') === 'production'
    ? false
    : true

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  enabled: true,
  origin: originConfig,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
