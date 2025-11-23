# Script para instalar dependencias e rodar servidor
param(
    [string]$Directory,
    [string]$Command = "dev"
)

# Encontrar npm
$npmScript = Join-Path $PSScriptRoot "find-npm.ps1"
$npmPath = & $npmScript

if (-not $npmPath) {
    Write-Host "Nao foi possivel encontrar npm. Instale Node.js primeiro." -ForegroundColor Red
    pause
    exit 1
}

# Mudar para o diretorio
if ($Directory) {
    Set-Location $Directory
}

# Verificar se node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias..." -ForegroundColor Yellow
    & $npmPath install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao instalar dependencias" -ForegroundColor Red
        pause
        exit 1
    }
    Write-Host "Dependencias instaladas com sucesso!" -ForegroundColor Green
    Write-Host ""
}

# Executar comando
Write-Host "Iniciando servidor..." -ForegroundColor Green
& $npmPath run $Command



