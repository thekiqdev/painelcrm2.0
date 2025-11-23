# Guia de Migração: Supabase para PostgreSQL Docker

Este documento descreve a migração completa do projeto de Supabase para PostgreSQL puro com Docker.

## Estrutura Criada

### 1. Docker e Banco de Dados
- `docker-compose.yml` - Configuração do PostgreSQL
- `database/init/` - Migrations SQL convertidas (10 arquivos)
  - `01_create_users_and_auth.sql` - Tabelas de usuários e autenticação
  - `02_create_enums.sql` - Enums do sistema
  - `03_create_permissions_and_roles.sql` - Sistema de permissões
  - `04_create_leads_and_clients.sql` - Leads e clientes
  - `05_create_funnels.sql` - Funis de vendas
  - `06_create_products.sql` - Produtos e loja
  - `07_create_contracts.sql` - Contratos
  - `08_create_projects.sql` - Projetos
  - `09_create_tickets.sql` - Sistema de tickets
  - `10_create_whatsapp.sql` - Integração WhatsApp

### 2. Backend API
- `packages/backend/` - API Node.js/Express
  - Autenticação JWT
  - Endpoints de auth (`/api/auth/*`)
  - Middleware de autenticação
  - Cliente PostgreSQL (pg)

### 3. Frontend
- `src/integrations/api/client.ts` - Cliente HTTP substituindo Supabase
- `src/contexts/AuthContext.tsx` - Atualizado para usar nova API
- `src/utils/auth-helpers.ts` - Atualizado para usar nova API

## Como Usar

### 1. Iniciar o Banco de Dados
```bash
docker-compose up -d
```

### 2. Instalar Dependências do Backend
```bash
cd packages/backend
npm install
```

### 3. Configurar Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto:
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=painelcrm
POSTGRES_PORT=5432
POSTGRES_HOST=localhost
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
API_PORT=3001
VITE_API_URL=http://localhost:3001
```

### 4. Iniciar o Backend
```bash
cd packages/backend
npm run dev
```

### 5. Iniciar o Frontend
```bash
npm run dev
```

## Próximos Passos

1. **Criar endpoints da API** para todas as entidades (leads, clients, products, etc.)
2. **Migrar todos os services** do frontend para usar a nova API
3. **Atualizar todas as páginas** que ainda usam Supabase diretamente
4. **Converter Edge Functions** para endpoints da API
5. **Remover dependência do Supabase** do package.json
6. **Testar todas as funcionalidades**

## Notas Importantes

- As migrations foram convertidas removendo todas as dependências do Supabase (`auth.uid()`, `auth.users`, RLS)
- A segurança RLS foi substituída por middleware/guards no backend
- A autenticação agora usa JWT ao invés do sistema do Supabase
- Todas as foreign keys para `auth.users` foram substituídas por `public.users`


