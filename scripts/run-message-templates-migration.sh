#!/bin/bash
# Script para executar a migration de modelos de mensagens no banco de dados local
# Uso: ./scripts/run-message-templates-migration.sh

export PGPASSWORD=postgres
SQL_FILE="database/init/21_create_message_templates.sql"

echo "Executando migration de modelos de mensagens..."
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

