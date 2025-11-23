# Script para verificar se Node.js está instalado e configurado
Write-Host "=== Verificando Node.js ===" -ForegroundColor Cyan
Write-Host ""

# Verificar node
Write-Host "Verificando 'node'..." -ForegroundColor Yellow
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nodeVersion = node --version 2>&1
    Write-Host "  [OK] Node.js encontrado: $nodeVersion" -ForegroundColor Green
    Write-Host "  Localizacao: $($node.Source)" -ForegroundColor Gray
} else {
    Write-Host "  [ERRO] Node.js nao encontrado no PATH" -ForegroundColor Red
}

Write-Host ""

# Verificar npm
Write-Host "Verificando 'npm'..." -ForegroundColor Yellow
$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm) {
    $npmVersion = npm --version 2>&1
    Write-Host "  [OK] npm encontrado: $npmVersion" -ForegroundColor Green
    Write-Host "  Localizacao: $($npm.Source)" -ForegroundColor Gray
} else {
    Write-Host "  [ERRO] npm nao encontrado no PATH" -ForegroundColor Red
}

Write-Host ""

# Procurar em locais comuns
Write-Host "Procurando Node.js em locais comuns..." -ForegroundColor Yellow
$commonPaths = @(
    "$env:ProgramFiles\nodejs",
    "${env:ProgramFiles(x86)}\nodejs",
    "$env:LOCALAPPDATA\Programs\nodejs"
)

$found = $false
foreach ($path in $commonPaths) {
    if (Test-Path $path) {
        $nodeExe = Join-Path $path "node.exe"
        $npmCmd = Join-Path $path "npm.cmd"
        
        if (Test-Path $nodeExe) {
            Write-Host "  [ENCONTRADO] Node.js em: $path" -ForegroundColor Green
            $found = $true
            
            if (Test-Path $npmCmd) {
                Write-Host "    npm.cmd encontrado tambem" -ForegroundColor Gray
            }
        }
    }
}

if (-not $found) {
    Write-Host "  [NAO ENCONTRADO] Node.js nao esta nos locais comuns" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Resumo ===" -ForegroundColor Cyan

if ($node -and $npm) {
    Write-Host "Status: TUDO OK! Node.js e npm estao configurados." -ForegroundColor Green
    Write-Host ""
    Write-Host "Voce pode executar: .\start.bat" -ForegroundColor Cyan
} elseif ($found) {
    Write-Host "Status: Node.js esta instalado mas nao esta no PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "SOLUCAO:" -ForegroundColor Yellow
    Write-Host "1. Adicione o caminho do Node.js ao PATH do sistema" -ForegroundColor White
    Write-Host "2. REINICIE o terminal" -ForegroundColor White
    Write-Host "3. Execute este script novamente para verificar" -ForegroundColor White
} else {
    Write-Host "Status: Node.js NAO esta instalado" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUCAO:" -ForegroundColor Yellow
    Write-Host "1. Baixe Node.js de: https://nodejs.org/" -ForegroundColor White
    Write-Host "2. Instale a versao LTS" -ForegroundColor White
    Write-Host "3. Marque 'Add to PATH' durante a instalacao" -ForegroundColor White
    Write-Host "4. REINICIE o terminal" -ForegroundColor White
    Write-Host "5. Execute este script novamente para verificar" -ForegroundColor White
}

Write-Host ""



