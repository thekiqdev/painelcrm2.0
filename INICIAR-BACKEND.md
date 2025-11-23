# 🚀 Como Iniciar o Backend

## Problema
O backend não está rodando na porta 3001, causando o erro `ERR_CONNECTION_REFUSED`.

## Solução Rápida

### Opção 1: Usar o script start.bat (Recomendado)
```batch
.\start.bat
```

Isso iniciará:
- ✅ Docker (PostgreSQL)
- ✅ Backend (porta 3001)
- ✅ Frontend (porta 5173 ou 8081)

### Opção 2: Iniciar Backend Manualmente

1. **Abra um novo terminal/PowerShell**

2. **Navegue para o diretório do backend:**
```powershell
cd packages\backend
```

3. **Instale dependências (se necessário):**
```powershell
npm install
```

4. **Inicie o servidor:**
```powershell
npm run dev
```

Você deve ver:
```
Server running on port 3001
Environment: development
```

### Opção 3: Verificar se está rodando

Execute:
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
```

Se retornar `{"status":"ok","database":"connected"}`, o backend está funcionando!

## Verificar Portas

Para ver quais portas estão em uso:
```powershell
netstat -ano | findstr :3001
```

## Credenciais Admin

Após iniciar o backend, você pode fazer login com:

- **Email:** `admin@painelcrm.com`
- **Telefone:** `5511999999999`
- **Senha:** `admin123`

