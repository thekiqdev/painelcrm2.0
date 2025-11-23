# 🔑 Atualizar Senha do Admin

## Problema
Erro 401 (Unauthorized) - A senha do admin pode ter um hash incorreto.

## Solução

### Opção 1: Usar Endpoint Temporário (Recomendado)

Após o backend iniciar, execute no PowerShell:

```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/update-admin-password" -Method POST -ContentType "application/json" -UseBasicParsing
```

Isso atualizará a senha do admin para `admin123` com um hash correto.

### Opção 2: Executar Script Manualmente

1. Abra um terminal
2. Execute:
```powershell
cd packages\backend
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
node scripts/update-admin-password.mjs
```

## Credenciais Após Atualizar

- **Email:** `admin@painelcrm.com`
- **Telefone:** `5511999999999`
- **Senha:** `admin123`

## Importante

Após atualizar a senha, o endpoint temporário será removido por segurança.


