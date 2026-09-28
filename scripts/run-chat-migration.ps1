# Script para executar a migration de chat no banco de dados local
# Uso: .\scripts\run-chat-migration.ps1

$env:PGPASSWORD = "postgres"
$sqlFile = "database\init\15_create_chat_tables.sql"

Write-Host "Executando migration de chat..." -ForegroundColor Yellow
Write-Host "Arquivo: $sqlFile" -ForegroundColor Gray

if (-not (Test-Path $sqlFile)) {
    Write-Host "ERRO: Arquivo não encontrado: $sqlFile" -ForegroundColor Red
    exit 1
}

# Executar SQL usando psql
$result = & psql -h localhost -p 5432 -U postgres -d painelcrm -f $sqlFile 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Migration executada com sucesso!" -ForegroundColor Green
} else {
    Write-Host "❌ Erro ao executar migration:" -ForegroundColor Red
    Write-Host $result
    exit 1
}

