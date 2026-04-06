#!/bin/bash
# Script para executar a migration de chat no banco de dados local
# Uso: ./scripts/run-chat-migration.sh

export PGPASSWORD=postgres
SQL_FILE="database/init/15_create_chat_tables.sql"

echo "Executando migration de chat..."
echo "Arquivo: $SQL_FILE"

if [ ! -f "$SQL_FILE" ]; then
    echo "ERRO: Arquivo não encontrado: $SQL_FILE"
    exit 1
fi

# Executar SQL usando psql
psql -h localhost -p 5432 -U postgres -d painelcrm -f "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Migration executada com sucesso!"
else
    echo "❌ Erro ao executar migration"
    exit 1
fi

