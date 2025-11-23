# 🚨 INICIALIZAR BANCO DE DADOS NO EASYPANEL

## ⚠️ PROBLEMA ATUAL
O erro `relation "users" does not exist` significa que as tabelas do banco de dados não foram criadas.

## ✅ SOLUÇÃO: Executar Scripts SQL

### Passo 1: Acessar o PostgreSQL no Easypanel

1. No Easypanel, vá para o serviço **PostgreSQL** (`painelcrmbd` ou `sistemas_painelcrmbd`)
2. Clique em **"Terminal"** ou **"Console"**
3. Você verá um prompt `psql` ou similar

### Passo 2: Conectar ao Banco

Se não estiver conectado automaticamente, execute:
```sql
\c sistemas
```

Ou:
```sql
\c painelcrm
```

(Depende do nome do banco configurado no `POSTGRES_DB`)

### Passo 3: Executar Scripts na Ordem

Execute os scripts **na ordem numérica** (01, 02, 03...):

#### Script 01: Users e Auth
Copie e cole o conteúdo completo de `database/init/01_create_users_and_auth.sql`

#### Script 02: Enums
Copie e cole o conteúdo completo de `database/init/02_create_enums.sql`

#### Script 03: Permissions e Roles
Copie e cole o conteúdo completo de `database/init/03_create_permissions_and_roles.sql`

#### Script 04: Leads e Clients
Copie e cole o conteúdo completo de `database/init/04_create_leads_and_clients.sql`

#### Script 05: Funnels
Copie e cole o conteúdo completo de `database/init/05_create_funnels.sql`

#### Script 06: Products
Copie e cole o conteúdo completo de `database/init/06_create_products.sql`

#### Script 07: Contracts
Copie e cole o conteúdo completo de `database/init/07_create_contracts.sql`

#### Script 08: Projects
Copie e cole o conteúdo completo de `database/init/08_create_projects.sql`

#### Script 09: Tickets
Copie e cole o conteúdo completo de `database/init/09_create_tickets.sql`

#### Script 10: WhatsApp
Copie e cole o conteúdo completo de `database/init/10_create_whatsapp.sql`

#### Script 11: Tasks
Copie e cole o conteúdo completo de `database/init/11_create_tasks.sql`

#### Script 12: Proposals
Copie e cole o conteúdo completo de `database/init/12_create_proposals.sql`

#### Script 13: Finance
Copie e cole o conteúdo completo de `database/init/13_create_finance.sql`

### Passo 4: Verificar se Funcionou

Execute:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Você deve ver todas as tabelas listadas, incluindo:
- `users`
- `profiles`
- `clients`
- `leads`
- `funnels`
- etc.

### Passo 5: Criar Usuário Admin (Opcional)

Para criar um usuário de teste, execute:

```sql
-- Gerar hash da senha "admin123" (você pode usar bcrypt online ou o backend)
-- Exemplo de hash para senha "admin123":
INSERT INTO users (id, email, password_hash, email_verified, created_at)
VALUES (
  gen_random_uuid(),
  'admin@test.com',
  '$2a$10$rOzJqKqKqKqKqKqKqKqKqOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq',
  true,
  NOW()
);

-- Criar perfil
INSERT INTO profiles (id, first_name, last_name, whatsapp_number, registration_complete, created_at)
SELECT 
  id,
  'Admin',
  'User',
  '+5511999999999',
  true,
  NOW()
FROM users 
WHERE email = 'admin@test.com';
```

**⚠️ IMPORTANTE**: O hash acima é apenas um exemplo. Para gerar um hash real da senha, você pode:

1. **Usar o backend** (após criar as tabelas):
   - Fazer um POST para `/api/auth/register` com email e senha
   
2. **Usar um gerador online**:
   - https://bcrypt-generator.com/
   - Use 10 rounds
   - Cole a senha desejada
   - Copie o hash gerado

## ✅ Após Executar

1. **Reinicie o serviço backend** no Easypanel
2. **Tente fazer login** novamente
3. O erro `relation "users" does not exist` deve desaparecer

## 📝 Nota

Se você já executou alguns scripts antes, pode ver erros como "relation already exists". Isso é normal - os scripts usam `CREATE TABLE IF NOT EXISTS`, então são idempotentes (podem ser executados múltiplas vezes).

