# Script de desenvolvimento para Windows PowerShell
Write-Host "🚀 Iniciando ambiente de desenvolvimento..." -ForegroundColor Green

# Verificar se Docker está rodando
Write-Host "📦 Verificando Docker..." -ForegroundColor Yellow
$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker não está rodando. Por favor, inicie o Docker Desktop." -ForegroundColor Red
    exit 1
}

# Iniciar PostgreSQL
Write-Host "🐘 Iniciando PostgreSQL..." -ForegroundColor Yellow
docker-compose up -d postgres

# Aguardar PostgreSQL estar pronto
Write-Host "⏳ Aguardando PostgreSQL estar pronto..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verificar se backend tem node_modules
if (-not (Test-Path "packages/backend/node_modules")) {
    Write-Host "📦 Instalando dependências do backend..." -ForegroundColor Yellow
    Set-Location packages/backend
    npm install
    Set-Location ../..
}

# Verificar se frontend tem node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependências do frontend..." -ForegroundColor Yellow
    npm install
}

# Verificar arquivo .env
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Arquivo .env não encontrado. Criando a partir do .env.example..." -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "✅ Arquivo .env criado. Por favor, configure as variáveis de ambiente." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "✅ Ambiente pronto!" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar o backend, execute em um terminal:" -ForegroundColor Cyan
Write-Host "  cd packages/backend" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Para iniciar o frontend, execute em outro terminal:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""

