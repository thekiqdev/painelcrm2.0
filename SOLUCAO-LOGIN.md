# 🔧 Solução para Problemas de Login

## ❌ Problema 1: Local - 404 (Not Found)

**Erro:** `POST http://localhost:8080/api/auth/login 404 (Not Found)`

**Causa:** O backend não está rodando ou o frontend não está configurado para acessá-lo.

### ✅ Solução:

1. **Verifique se o backend está rodando:**
   ```powershell
   # Abra um novo terminal
   cd packages\backend
   npm run dev
   ```
   
   Você deve ver:
   ```
   🚀 Server running on port 3001
   Environment: development
   ```

2. **Verifique se há arquivo `.env` na raiz com:**
   ```env
   VITE_API_URL=http://localhost:3001
   ```

3. **Se não tiver `.env`, crie um:**
   ```env
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=painelcrm
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   JWT_SECRET=dev-secret-key-change-in-production
   JWT_EXPIRES_IN=7d
   API_PORT=3001
   NODE_ENV=development
   FRONTEND_URL=http://localhost:8080
   VITE_API_URL=http://localhost:3001
   ```

4. **Reinicie o frontend:**
   - Pare o frontend (Ctrl+C)
   - Inicie novamente: `npm run dev`

5. **Teste o backend diretamente:**
   ```powershell
   # Em outro terminal
   Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
   ```
   
   Deve retornar: `{"status":"ok","database":"connected"}`

---

## ❌ Problema 2: Online - 401 (Unauthorized)

**Erro:** `POST https://sistemas-painelcrm-frontend.g8o2qm.easypanel.host/api/auth/login 401 (Unauthorized)`

**Causa:** Credenciais inválidas ou usuário não criado corretamente.

### ✅ Solução:

1. **Verifique se o usuário foi criado:**
   
   No terminal do PostgreSQL no Easypanel, execute:
   ```sql
   SELECT id, email, whatsapp_number, email_verified 
   FROM users 
   WHERE email = 'admin@painelcrm.com';
   ```
   
   Se não retornar nada, o usuário não foi criado. Execute o script `CRIAR-USUARIO-ADMIN.sql`.

2. **Verifique se o perfil foi criado:**
   ```sql
   SELECT p.id, p.first_name, p.last_name, p.registration_complete
   FROM profiles p
   JOIN users u ON p.id = u.id
   WHERE u.email = 'admin@painelcrm.com';
   ```

3. **Verifique o hash da senha:**
   ```sql
   SELECT email, password_hash IS NOT NULL as has_password
   FROM users 
   WHERE email = 'admin@painelcrm.com';
   ```
   
   Deve retornar `has_password = true`.

4. **Recrie o usuário se necessário:**
   
   Execute o script completo `CRIAR-USUARIO-ADMIN.sql` novamente.

5. **Teste o login diretamente no backend:**
   
   No terminal do backend no Easypanel, você pode verificar os logs. Quando tentar fazer login, deve aparecer:
   ```
   [2025-XX-XX...] POST /api/auth/login
   ```
   
   Se aparecer erro, verifique os logs para ver qual é o problema específico.

---

## 🔍 Debug Adicional

### Verificar se o backend está recebendo requisições:

**Online (Easypanel):**
- Acesse os logs do serviço `painelcrm` (backend)
- Você deve ver logs como: `[2025-XX-XX...] POST /api/auth/login`
- Se não aparecer, o Nginx não está fazendo proxy corretamente

### Verificar hash da senha:

Se o hash estiver incorreto, você pode gerar um novo:

**Opção 1: Usar o backend (recomendado)**
```bash
# No terminal do backend
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin123', 10).then(h => console.log(h));"
```

**Opção 2: Usar gerador online**
- Acesse: https://bcrypt-generator.com/
- Senha: `admin123`
- Rounds: `10`
- Copie o hash gerado

**Opção 3: Atualizar senha via SQL**
```sql
-- Substitua HASH_AQUI pelo hash gerado
UPDATE users 
SET password_hash = 'HASH_AQUI'
WHERE email = 'admin@painelcrm.com';
```

---

## ✅ Credenciais Corretas

- **Email:** `admin@painelcrm.com`
- **Senha:** `admin123`
- **WhatsApp:** `11981199950`

---

## 📝 Checklist

### Local:
- [ ] Backend rodando na porta 3001
- [ ] Arquivo `.env` criado com `VITE_API_URL=http://localhost:3001`
- [ ] Frontend reiniciado após criar `.env`
- [ ] PostgreSQL rodando (Docker)

### Online:
- [ ] Tabelas criadas (scripts 01-13 executados)
- [ ] Usuário criado (script `CRIAR-USUARIO-ADMIN.sql` executado)
- [ ] Backend recebendo requisições (verificar logs)
- [ ] Nginx fazendo proxy corretamente

