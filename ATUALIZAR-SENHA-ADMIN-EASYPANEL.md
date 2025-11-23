# 🔑 Atualizar Senha do Admin no Easypanel

## Problema
Login retorna 401 mesmo com usuário criado - o hash da senha pode estar incorreto.

## ✅ Solução: Gerar Hash Correto

### Opção 1: Usar o Backend para Gerar Hash (Recomendado)

1. **Acesse o terminal do backend** no Easypanel (serviço `painelcrm`)

2. **Execute o script de geração de hash:**
   ```bash
   cd /app
   node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin123', 10).then(h => console.log('Hash:', h));"
   ```

3. **Copie o hash gerado** (será algo como `$2a$10$...`)

4. **No terminal do PostgreSQL**, execute:
   ```sql
   UPDATE users 
   SET password_hash = 'HASH_GERADO_AQUI'
   WHERE email = 'admin@painelcrm.com';
   ```

5. **Verifique se foi atualizado:**
   ```sql
   SELECT email, password_hash IS NOT NULL as has_password
   FROM users 
   WHERE email = 'admin@painelcrm.com';
   ```

### Opção 2: Usar Gerador Online

1. Acesse: https://bcrypt-generator.com/
2. Senha: `admin123`
3. Rounds: `10`
4. Clique em "Generate Hash"
5. Copie o hash gerado
6. Execute no PostgreSQL:
   ```sql
   UPDATE users 
   SET password_hash = 'HASH_COPIADO_AQUI'
   WHERE email = 'admin@painelcrm.com';
   ```

### Opção 3: Criar Usuário via API (Se Backend Estiver Funcionando)

Se você conseguir fazer um registro via API, pode usar:

```bash
# No terminal do backend ou via curl
curl -X POST https://sistemas-painelcrm-frontend.g8o2qm.easypanel.host/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin2@painelcrm.com",
    "password": "admin123",
    "whatsapp": "11981199950"
  }'
```

Depois, copie o hash desse usuário para o admin:
```sql
UPDATE users 
SET password_hash = (SELECT password_hash FROM users WHERE email = 'admin2@painelcrm.com')
WHERE email = 'admin@painelcrm.com';
```

## ✅ Após Atualizar

1. **Tente fazer login novamente** com:
   - Email: `admin@painelcrm.com`
   - Senha: `admin123`

2. **Verifique os logs do backend** para ver se há mais informações sobre o erro

## 🔍 Debug

Se ainda não funcionar, verifique os logs do backend. Você deve ver:
```
Attempting login for: admin@painelcrm.com
User found: admin@painelcrm.com
Password hash exists: true
Password hash length: 60
Password comparison result: true/false
```

Se `Password comparison result: false`, o hash está incorreto e precisa ser regenerado.

