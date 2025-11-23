# Script simplificado - inicia tudo sem aguardar muito
param(
    [switch]$SkipDocker,
    [switch]$SkipBackend,
    [switch]$SkipFrontend
)

# Recarregar PATH para incluir Node.js
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Verificar se npm esta disponivel
$npmPath = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmPath) {
    Write-Host "ERRO: npm nao encontrado. Verifique se Node.js esta instalado." -ForegroundColor Red
    Write-Host "      Tente reiniciar o terminal ou instalar Node.js de https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

Write-Host "=== Iniciando Sistema ===" -ForegroundColor Green
Write-Host ""

# 1. Docker
if (-not $SkipDocker) {
    Write-Host "[1/3] Iniciando Docker (PostgreSQL)..." -ForegroundColor Yellow
    docker-compose up -d postgres
    Start-Sleep -Seconds 3
    Write-Host "      Docker iniciado (pode levar alguns segundos para ficar pronto)" -ForegroundColor Gray
    Write-Host ""
}

# 2. Backend
if (-not $SkipBackend) {
    Write-Host "[2/3] Iniciando Backend..." -ForegroundColor Yellow
    
    if (-not (Test-Path "packages/backend/node_modules")) {
        Write-Host "      Instalando dependencias..." -ForegroundColor Gray
        Push-Location packages/backend
        npm install
        Pop-Location
    }
    
    $backendPath = Join-Path $PWD "packages\backend"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm run dev"
    Write-Host "      Backend iniciado em nova janela (http://localhost:3001)" -ForegroundColor Green
    Write-Host ""
}

# 3. Frontend
if (-not $SkipFrontend) {
    Write-Host "[3/3] Iniciando Frontend..." -ForegroundColor Yellow
    
    if (-not (Test-Path "node_modules")) {
        Write-Host "      Instalando dependencias..." -ForegroundColor Gray
        npm install
    }
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev"
    Write-Host "      Frontend iniciado em nova janela (http://localhost:5173)" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== Pronto! ===" -ForegroundColor Green
Write-Host ""
Write-Host "URLs:" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "Para parar: Ctrl+C nas janelas ou docker-compose down" -ForegroundColor Gray

