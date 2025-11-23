# Script para encontrar e usar npm
$npmPath = $null

# Locais comuns onde Node.js pode estar instalado
$commonPaths = @(
    "$env:ProgramFiles\nodejs\npm.cmd",
    "${env:ProgramFiles(x86)}\nodejs\npm.cmd",
    "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd",
    "C:\Program Files\nodejs\npm.cmd",
    "C:\Program Files (x86)\nodejs\npm.cmd"
)

# Procurar npm
foreach ($path in $commonPaths) {
    if (Test-Path $path) {
        $npmPath = $path
        break
    }
}

# Se não encontrou, tentar usar node para encontrar
if (-not $npmPath) {
    try {
        $nodePath = Get-Command node -ErrorAction SilentlyContinue
        if ($nodePath) {
            $nodeDir = Split-Path $nodePath.Source
            $npmPath = Join-Path $nodeDir "npm.cmd"
            if (-not (Test-Path $npmPath)) {
                $npmPath = $null
            }
        }
    } catch {
        # Continuar
    }
}

# Tentar usar npm do PATH como último recurso
if (-not $npmPath) {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if ($npmCmd) {
        $npmPath = "npm"
    }
}

if ($npmPath) {
    Write-Host "npm encontrado em: $npmPath" -ForegroundColor Green
    return $npmPath
} else {
    Write-Host "ERRO: npm nao encontrado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUCAO:" -ForegroundColor Yellow
    Write-Host "1. Instale Node.js de: https://nodejs.org/" -ForegroundColor White
    Write-Host "2. Baixe a versao LTS (Long Term Support)" -ForegroundColor White
    Write-Host "3. Durante a instalacao, marque 'Add to PATH'" -ForegroundColor White
    Write-Host "4. REINICIE o terminal/PowerShell" -ForegroundColor White
    Write-Host "5. Execute novamente" -ForegroundColor White
    exit 1
}



