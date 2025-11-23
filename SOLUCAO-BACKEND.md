# 🔧 Solução: Backend não está iniciando

## Problema
O backend não está rodando na porta 3001, causando `ERR_CONNECTION_REFUSED`.

## Erro no Log
```
A sintaxe do nome do arquivo, do nome do diretório ou do rótulo do volume está incorreta.
```

Este erro ocorre porque o caminho do Node.js tem espaços (`C:\Program Files\nodejs`) e não está sendo tratado corretamente no script.

## Solução Imediata

### Opção 1: Iniciar Backend Manualmente (Mais Rápido)

1. **Abra um novo terminal/PowerShell**

2. **Execute:**
```powershell
cd packages\backend
npm run dev
```

Você deve ver:
```
Server running on port 3001
Environment: development
```

### Opção 2: Usar o script corrigido

O script `run-backend.bat` foi corrigido. Feche todas as janelas do backend e execute novamente:
```batch
.\start.bat
```

## Verificar se está funcionando

Após iniciar, teste:
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
```

Deve retornar: `{"status":"ok","database":"connected"}`

## Credenciais Admin

Após o backend iniciar, você pode fazer login:

- **Email:** `admin@painelcrm.com`
- **Telefone:** `5511999999999`
- **Senha:** `admin123`

## Se ainda não funcionar

1. Verifique se o Docker está rodando:
```powershell
docker ps
```

2. Verifique se a porta 3001 está livre:
```powershell
netstat -ano | findstr :3001
```

3. Verifique os logs do backend na janela onde ele está rodando

