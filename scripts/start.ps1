# Script unico para iniciar Docker, Backend e Frontend (Windows PowerShell)
param(
    [switch]$SkipDocker,
    [switch]$SkipBackend,
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Continue"

Write-Host "=== Iniciando Sistema ===" -ForegroundColor Green
Write-Host ""

# Funcao para encontrar npm
function Find-Npm {
    # Tentar encontrar npm em locais comuns
    $commonPaths = @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        "$env:ProgramFiles(x86)\nodejs\npm.cmd",
        "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd",
        "C:\Program Files\nodejs\npm.cmd"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    # Tentar usar npm do PATH
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) {
        return "npm"
    }
    
    return $null
}

$npmCmd = Find-Npm
if (-not $npmCmd) {
    Write-Host "AVISO: npm nao encontrado no PATH." -ForegroundColor Yellow
    Write-Host "      Tentando continuar... (as janelas abertas podem ter npm no PATH)" -ForegroundColor Gray
    $npmCmd = "npm"  # Tentar mesmo assim
}

# 1. Iniciar Docker (PostgreSQL)
if (-not $SkipDocker) {
    Write-Host "[1/3] Iniciando Docker (PostgreSQL)..." -ForegroundColor Yellow
    
    try {
        $null = docker ps 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Docker nao esta rodando"
        }
    } catch {
        Write-Host "ERRO: Docker nao esta rodando. Inicie o Docker Desktop." -ForegroundColor Red
        exit 1
    }
    
    docker-compose up -d postgres | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Docker iniciado" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } else {
        Write-Host "      AVISO: Erro ao iniciar Docker (pode ja estar rodando)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# 2. Iniciar Backend
if (-not $SkipBackend) {
    Write-Host "[2/3] Iniciando Backend..." -ForegroundColor Yellow
    
    $backendPath = Join-Path $PWD "packages\backend"
    
    # Verificar se precisa instalar dependencias
    if (-not (Test-Path "$backendPath\node_modules")) {
        Write-Host "      Instalando dependencias do backend..." -ForegroundColor Gray
        Push-Location $backendPath
        try {
            # Tentar encontrar npm novamente no contexto atual
            $npm = Get-Command npm -ErrorAction SilentlyContinue
            if ($npm) {
                & npm install
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "      Dependencias do backend instaladas!" -ForegroundColor Green
                } else {
                    Write-Host "      AVISO: Erro ao instalar. A janela do backend tentara instalar." -ForegroundColor Yellow
                }
            } else {
                Write-Host "      AVISO: npm nao encontrado. A janela do backend tentara instalar." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "      AVISO: Erro ao instalar. A janela do backend tentara instalar." -ForegroundColor Yellow
        }
        Pop-Location
    } else {
        Write-Host "      Dependencias do backend ja instaladas" -ForegroundColor Gray
    }
    
    # Iniciar backend em nova janela usando script helper
    $installScript = Join-Path $PSScriptRoot "install-and-run.ps1"
    $backendScript = "& '$installScript' -Directory '$backendPath' -Command 'dev'"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript -WindowStyle Normal
    Start-Sleep -Seconds 2
    Write-Host "      Backend iniciado em nova janela (http://localhost:3001)" -ForegroundColor Green
    Write-Host ""
}

# 3. Iniciar Frontend
if (-not $SkipFrontend) {
    Write-Host "[3/3] Iniciando Frontend..." -ForegroundColor Yellow
    
    # Verificar se precisa instalar dependencias
    if (-not (Test-Path "node_modules")) {
        Write-Host "      Instalando dependencias do frontend..." -ForegroundColor Gray
        try {
            $npm = Get-Command npm -ErrorAction SilentlyContinue
            if ($npm) {
                & npm install
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "      Dependencias do frontend instaladas!" -ForegroundColor Green
                } else {
                    Write-Host "      AVISO: Erro ao instalar. A janela do frontend tentara instalar." -ForegroundColor Yellow
                }
            } else {
                Write-Host "      AVISO: npm nao encontrado. A janela do frontend tentara instalar." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "      AVISO: Erro ao instalar. A janela do frontend tentara instalar." -ForegroundColor Yellow
        }
    } else {
        Write-Host "      Dependencias do frontend ja instaladas" -ForegroundColor Gray
    }
    
    # Iniciar frontend em nova janela usando script helper
    $installScript = Join-Path $PSScriptRoot "install-and-run.ps1"
    $frontendScript = "& '$installScript' -Directory '$PWD' -Command 'dev'"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript -WindowStyle Normal
    Start-Sleep -Seconds 2
    Write-Host "      Frontend iniciado em nova janela (http://localhost:5173)" -ForegroundColor Green
    Write-Host ""
}

# Resumo
Write-Host "=== Pronto! ===" -ForegroundColor Green
Write-Host ""
Write-Host "URLs:" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor White
Write-Host "  Health:   http://localhost:3001/health" -ForegroundColor White
Write-Host ""
Write-Host "Dicas:" -ForegroundColor Cyan
Write-Host "  - Use Ctrl+C nas janelas para parar" -ForegroundColor Gray
Write-Host "  - Para parar Docker: docker-compose down" -ForegroundColor Gray
Write-Host ""
Write-Host "Opcoes:" -ForegroundColor Cyan
Write-Host "  .\scripts\start.ps1 -SkipDocker    # Pular Docker" -ForegroundColor Gray
Write-Host "  .\scripts\start.ps1 -SkipBackend  # Pular Backend" -ForegroundColor Gray
Write-Host "  .\scripts\start.ps1 -SkipFrontend  # Pular Frontend" -ForegroundColor Gray
