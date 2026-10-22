module.exports = {
  apps: [
    {
      name: 'api-target',
      script: './bin/server.js',
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 4000,
      listen_timeout: 8000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
