# Script para iniciar o backend
Write-Host "=== Iniciando Backend ===" -ForegroundColor Green
Write-Host ""

$backendPath = Join-Path $PSScriptRoot "packages\backend"

# Encontrar npm
$npmPath = $null
$commonPaths = @(
    "$env:ProgramFiles\nodejs\npm.cmd",
    "${env:ProgramFiles(x86)}\nodejs\npm.cmd",
    "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd"
)

foreach ($path in $commonPaths) {
    if (Test-Path $path) {
        $npmPath = $path
        break
    }
}

if (-not $npmPath) {
    Write-Host "ERRO: npm nao encontrado!" -ForegroundColor Red
    Write-Host "Instale Node.js de: https://nodejs.org/" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "npm encontrado: $npmPath" -ForegroundColor Gray
Write-Host ""

# Mudar para diretorio do backend
Set-Location $backendPath

# Verificar dependencias
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias..." -ForegroundColor Yellow
    & $npmPath install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao instalar dependencias" -ForegroundColor Red
        pause
        exit 1
    }
}

Write-Host "Iniciando servidor backend..." -ForegroundColor Green
Write-Host "Backend rodando em: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Gray
Write-Host ""

# Adicionar Node.js ao PATH
$nodeDir = Split-Path (Split-Path $npmPath)
if ($nodeDir) {
    $env:PATH = "$nodeDir;$env:PATH"
}

# Iniciar servidor
& $npmPath run dev

