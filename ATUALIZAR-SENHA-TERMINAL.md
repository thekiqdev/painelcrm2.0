# 🔑 Atualizar Senha do Admin - Terminal do Backend

## ✅ Solução: Usar Node.js Diretamente

Como `curl` não está disponível no container, use Node.js diretamente:

### Opção 1: Script Node.js (Recomendado)

No terminal do backend (`/app`), execute:

```bash
node -e "
fetch('http://localhost:3001/api/auth/update-admin-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@painelcrm.com',
    password: 'admin123'
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Sucesso:', JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error('❌ Erro:', err.message);
});
"
```

### Opção 2: Usar wget (se disponível)

```bash
wget --method=POST \
  --header='Content-Type: application/json' \
  --body-data='{"email":"admin@painelcrm.com","password":"admin123"}' \
  -O- \
  http://localhost:3001/api/auth/update-admin-password
```

### Opção 3: Via Console do Navegador (Mais Fácil)

Abra o console do navegador (F12) e execute:

```javascript
fetch('https://sistemas-painelcrm-frontend.g8o2qm.easypanel.host/api/auth/update-admin-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@painelcrm.com',
    password: 'admin123'
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Sucesso:', data);
  alert('Senha atualizada! Tente fazer login novamente.');
})
.catch(err => {
  console.error('❌ Erro:', err);
  alert('Erro ao atualizar senha.');
});
```

## ✅ Após Atualizar

1. Tente fazer login com:
   - Email: `admin@painelcrm.com`
   - Senha: `admin123`

2. Verifique os logs do backend para ver:
   ```
   Attempting login for: admin@painelcrm.com
   Password comparison result: true
   ```

