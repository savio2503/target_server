#!/bin/bash
set -e

# Configurações do seu Raspberry Pi / Servidor
PI_USER="savio"
PI_HOST="raspberrypi.local" # ou use o IP local: 192.168.3.20
PI_DEST="~/apps/api-target/build/"

echo "🚀 1. Compilando o projeto no Mac..."
npm run build
cp ecosystem.config.cjs build/

echo "📦 2. Enviando build para o servidor..."
rsync -avz --delete build/ ${PI_USER}@${PI_HOST}:${PI_DEST}

echo "🔄 3. Garantindo diretórios, dependências e recarregando o Cluster sem downtime..."
ssh ${PI_USER}@${PI_HOST} << 'EOF'
  mkdir -p ~/apps/api-target/storage/targets/original
  mkdir -p ~/apps/api-target/storage/targets/cache
  cd ~/apps/api-target/build
  npm ci --omit=dev
  node ace migration:run --force
  pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
  pm2 save
EOF

echo "✅ Deploy finalizado com sucesso em produção!"
