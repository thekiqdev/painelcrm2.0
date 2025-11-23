# Próximos Passos - Easypanel

## ✅ Status Atual

- ✅ Backend rodando na porta 3001
- ✅ Variáveis de ambiente configuradas
- ✅ Dependências instaladas corretamente

## 🔍 Passo 1: Verificar Conexão com PostgreSQL

Após o próximo deploy, verifique os logs do serviço Backend no Easypanel. Você deve ver:

### ✅ Sucesso:
```
✅ Connected to PostgreSQL database
🚀 Server running on port 3001
Environment: production
```

### ❌ Erro de Conexão:
Se aparecer:
```
❌ Failed to connect to PostgreSQL: ...
```

**Soluções:**
1. Verifique se o serviço PostgreSQL (`sistemas_painelcrmbd`) está rodando
2. Verifique se as variáveis estão corretas:
   - `POSTGRES_HOST` = `sistemas_painelcrmbd` (nome do serviço)
   - `POSTGRES_DB` = `sistemas`
   - `POSTGRES_USER` = `postgres`
   - `POSTGRES_PASSWORD` = `f3e7198c7920451a4bc4`
3. Verifique se o backend tem permissão para acessar o serviço PostgreSQL (dependências no Easypanel)

## 🧪 Passo 2: Testar Health Check

Após confirmar a conexão, teste o endpoint de health check:

**URL:** `https://seu-backend-url/health`

**Resposta esperada:**
```json
{
  "status": "ok",
  "database": "connected"
}
```

Se retornar `"database": "disconnected"`, há um problema na conexão.

## 📊 Passo 3: Inicializar Banco de Dados

Após confirmar que a conexão está funcionando, execute os scripts SQL na ordem abaixo.

### Opção 1: Via Terminal do Easypanel

1. **Acesse o terminal do serviço PostgreSQL** (`sistemas_painelcrmbd`) no Easypanel
2. **Conecte ao banco:**
   ```bash
   psql -U postgres -d sistemas
   ```
3. **Execute os scripts na ordem:**

```sql
-- 1. Criar usuários e autenticação
\i /path/to/01_create_users_and_auth.sql

-- 2. Criar enums
\i /path/to/02_create_enums.sql

-- ... e assim por diante
```

### Opção 2: Via Cliente SQL (Recomendado)

Use um cliente SQL como **pgAdmin**, **DBeaver** ou **TablePlus**:

1. **Conecte ao banco:**
   - Host: `sistemas_painelcrmbd` (ou o IP/hostname fornecido pelo Easypanel)
   - Porta: `5432`
   - Database: `sistemas`
   - Usuário: `postgres`
   - Senha: `f3e7198c7920451a4bc4`

2. **Execute os scripts na ordem:**

#### Ordem de Execução:

1. ✅ `01_create_users_and_auth.sql` - Usuários e autenticação
2. ✅ `02_create_enums.sql` - Tipos enumerados
3. ✅ `03_create_permissions_and_roles.sql` - Permissões e papéis
4. ✅ `04_create_leads_and_clients.sql` - Leads e clientes
5. ✅ `05_create_funnels.sql` - Funis de vendas
6. ✅ `06_create_products.sql` - Produtos
7. ✅ `07_create_contracts.sql` - Contratos
8. ✅ `08_create_projects.sql` - Projetos
9. ✅ `09_create_tickets.sql` - Tickets
10. ✅ `10_create_whatsapp.sql` - WhatsApp
11. ✅ `11_create_tasks.sql` - Tarefas
12. ✅ `12_create_proposals.sql` - Propostas
13. ✅ `13_create_finance.sql` - Financeiro (invoices e expenses)

### Opção 3: Via Script Automatizado (Futuro)

Podemos criar um script que executa todos os arquivos automaticamente. Por enquanto, use uma das opções acima.

## 👤 Passo 4: Criar Usuário Admin

Após inicializar o banco, crie um usuário admin para fazer login:

```sql
-- Inserir usuário admin
INSERT INTO users (id, email, password_hash, email_verified)
VALUES (
  gen_random_uuid(),
  'admin@seu-dominio.com',
  '$2a$10$...', -- Use bcrypt para gerar o hash da senha
  true
);

-- Criar perfil
INSERT INTO profiles (id, first_name, last_name, whatsapp_number, registration_complete)
VALUES (
  (SELECT id FROM users WHERE email = 'admin@seu-dominio.com'),
  'Admin',
  'User',
  '+5511999999999',
  true
);
```

**Para gerar o hash da senha:**
```bash
# No terminal do backend (ou localmente)
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('sua-senha-aqui', 10));"
```

## 🔐 Passo 5: Verificar JWT_SECRET

Certifique-se de que `JWT_SECRET` está configurado e é uma chave forte:

```bash
# Gerar uma chave forte (se ainda não tiver)
openssl rand -base64 32
```

Adicione no Easypanel:
- `JWT_SECRET` = `<chave-gerada>`

## 🌐 Passo 6: Configurar Frontend

Após o backend estar funcionando:

1. **Configure o serviço Frontend no Easypanel**
2. **Variável de ambiente:**
   - `VITE_API_URL` = URL do seu backend (ex: `https://api.seu-dominio.com/api`)

## 📋 Checklist Final

- [ ] Backend conectando ao PostgreSQL (ver logs)
- [ ] Health check retornando `"database": "connected"`
- [ ] Scripts SQL executados na ordem
- [ ] Usuário admin criado
- [ ] `JWT_SECRET` configurado
- [ ] `NODE_ENV=production` configurado
- [ ] Frontend configurado e apontando para o backend
- [ ] Testar login no frontend

## 🆘 Troubleshooting

### Backend não conecta ao banco
- Verifique se o serviço PostgreSQL está rodando
- Verifique se `POSTGRES_HOST` está correto (deve ser o nome do serviço)
- Verifique credenciais (usuário, senha, database)

### Erro ao executar scripts SQL
- Execute na ordem correta (1, 2, 3, ...)
- Verifique se não há erros de sintaxe
- Verifique se as tabelas anteriores foram criadas

### Health check retorna erro
- Verifique logs do backend
- Verifique se o banco está acessível
- Teste a conexão manualmente com `psql`

---

**Última atualização:** Após deploy do backend com verificação de conexão

