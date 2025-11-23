#!/bin/bash

# Script de desenvolvimento para Linux/Mac
echo "🚀 Iniciando ambiente de desenvolvimento..."

# Verificar se Docker está rodando
echo "📦 Verificando Docker..."
if ! docker ps &> /dev/null; then
    echo "❌ Docker não está rodando. Por favor, inicie o Docker."
    exit 1
fi

# Iniciar PostgreSQL
echo "🐘 Iniciando PostgreSQL..."
docker-compose up -d postgres

# Aguardar PostgreSQL estar pronto
echo "⏳ Aguardando PostgreSQL estar pronto..."
sleep 5

# Verificar se backend tem node_modules
if [ ! -d "packages/backend/node_modules" ]; then
    echo "📦 Instalando dependências do backend..."
    cd packages/backend
    npm install
    cd ../..
fi

# Verificar se frontend tem node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências do frontend..."
    npm install
fi

# Verificar arquivo .env
if [ ! -f ".env" ]; then
    echo "⚠️  Arquivo .env não encontrado. Criando a partir do .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Arquivo .env criado. Por favor, configure as variáveis de ambiente."
    fi
fi

echo ""
echo "✅ Ambiente pronto!"
echo ""
echo "Para iniciar o backend, execute em um terminal:"
echo "  cd packages/backend"
echo "  npm run dev"
echo ""
echo "Para iniciar o frontend, execute em outro terminal:"
echo "  npm run dev"
echo ""

