# 📋 Janelas Abertas pelo Script

## É Normal Ter 2 Janelas?

**SIM!** É completamente normal e esperado. O script abre:

1. **1 janela para o Backend** (porta 3001)
   - Título: "Backend - PainelCRM"
   - Mostra logs do servidor backend
   - Instala dependências se necessário

2. **1 janela para o Frontend** (porta 5173)
   - Título: "Frontend - PainelCRM"
   - Mostra logs do servidor frontend
   - Instala dependências se necessário

## Por Que 2 Janelas?

Cada servidor (backend e frontend) precisa rodar em processos separados:
- **Backend**: API Node.js/Express na porta 3001
- **Frontend**: Servidor de desenvolvimento Vite na porta 5173

## Tipo de Janela

### Se usar `start.bat` (raiz):
- Abre janelas **CMD** (mais leve)
- Não precisa de política de execução do PowerShell

### Se usar `scripts/start.ps1` diretamente:
- Abre janelas **PowerShell**
- Pode precisar de política de execução

## Como Parar

- **Fechar as janelas**: Feche as janelas do backend/frontend
- **Ctrl+C**: Pressione Ctrl+C em cada janela
- **Docker**: Execute `docker-compose down` para parar o PostgreSQL

## Verificar se Está Funcionando

Após iniciar, acesse:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

Se as URLs abrirem, está tudo funcionando! ✅

