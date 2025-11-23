# 🚀 Como Iniciar o Backend Manualmente

## Problema
O `npm` não está no PATH do PowerShell.

## Solução: Usar Caminho Completo

### Método 1: Comando Direto (Recomendado)

Execute no terminal:
```powershell
cd packages\backend
& "C:\Program Files\nodejs\npm.cmd" run dev
```

### Método 2: Adicionar ao PATH Temporariamente

Execute antes de rodar npm:
```powershell
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
cd packages\backend
npm run dev
```

### Método 3: Usar o Script start.bat

O script `start.bat` já resolve isso automaticamente:
```batch
.\start.bat
```

## Verificar se Funcionou

Após alguns segundos, teste:
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
```

Deve retornar: `{"status":"ok","database":"connected"}`

## O que Você Deve Ver

Quando o backend iniciar corretamente, você verá:
```
Server running on port 3001
Environment: development
Connected to PostgreSQL database
```

## Credenciais Admin

Após o backend iniciar:
- **Email:** `admin@painelcrm.com`
- **Telefone:** `5511999999999`
- **Senha:** `admin123`

