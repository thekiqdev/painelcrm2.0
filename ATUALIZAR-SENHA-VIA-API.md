# 🔑 Atualizar Senha do Admin via API

## ✅ Solução Rápida

Criei um endpoint temporário para atualizar a senha do admin. Use este método:

### Passo 1: Aguardar Build

Aguarde o novo build do backend no Easypanel (deve iniciar automaticamente após o push).

### Passo 2: Atualizar Senha via API

**Opção A: Via Terminal do Backend (Easypanel)**

No terminal do serviço `painelcrm` (backend), execute:

```bash
curl -X POST http://localhost:3001/api/auth/update-admin-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@painelcrm.com",
    "password": "admin123"
  }'
```

**Opção B: Via Navegador (Console do Navegador)**

Abra o console do navegador (F12) e execute:

```javascript
fetch('https://sistemas-painelcrm-frontend.g8o2qm.easypanel.host/api/auth/update-admin-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'admin@painelcrm.com',
    password: 'admin123'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

### Passo 3: Verificar

Você deve receber uma resposta como:
```json
{
  "message": "Password updated successfully",
  "user": {
    "id": "...",
    "email": "admin@painelcrm.com"
  }
}
```

### Passo 4: Testar Login

Agora tente fazer login novamente com:
- **Email:** `admin@painelcrm.com`
- **Senha:** `admin123`

## ⚠️ Importante

Este endpoint é temporário e deve ser removido após atualizar a senha por segurança.

## 🔍 Verificar Logs

Após tentar fazer login, verifique os logs do backend. Você deve ver:
```
Attempting login for: admin@painelcrm.com
User found: admin@painelcrm.com
Password hash exists: true
Password hash length: 60
Password comparison result: true
```

Se `Password comparison result: true`, o login deve funcionar!

