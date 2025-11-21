# Guia de Deploy no Easypanel

Este guia explica como fazer deploy do PainelCRM no Easypanel.

## Estrutura do Projeto

O projeto possui 3 componentes principais:
1. **Backend API** (Node.js/Express) - Porta 3001
2. **Frontend** (React/Vite) - Porta 80 (Nginx)
3. **PostgreSQL** - Banco de dados

## Configuração no Easypanel

### 1. Criar Aplicação

No Easypanel, você precisará criar **3 serviços**:

#### Serviço 1: PostgreSQL (Database)

- **Tipo**: PostgreSQL
- **Versão**: 15
- **Nome**: `painelcrm-db`
- **Variáveis de Ambiente**:
  - `POSTGRES_USER`: `postgres` (ou seu usuário)
  - `POSTGRES_PASSWORD`: (defina uma senha forte)
  - `POSTGRES_DB`: `painelcrm`
- **Volumes**: Criar volume para persistência de dados

#### Serviço 2: Backend API

- **Tipo**: App
- **Nome**: `painelcrm-backend`
- **Dockerfile**: Use o arquivo `Dockerfile` (raiz do projeto)
- **Contexto de Build**: Raiz do repositório
- **Porta**: 3001
- **Variáveis de Ambiente**:
  ```
  NODE_ENV=production
  POSTGRES_HOST=painelcrm-db
  POSTGRES_PORT=5432
  POSTGRES_DB=painelcrm
  POSTGRES_USER=postgres
  POSTGRES_PASSWORD=<sua-senha-postgres>
  JWT_SECRET=<gere-um-secret-aleatorio-forte>
  JWT_EXPIRES_IN=7d
  API_PORT=3001
  FRONTEND_URL=https://seu-dominio.com
  ```
- **Health Check Path**: `/health`
- **Dependências**: `painelcrm-db` (deve iniciar após o banco)

#### Serviço 3: Frontend

- **Tipo**: App
- **Nome**: `painelcrm-frontend`
- **Dockerfile**: Use o arquivo `Dockerfile.frontend`
- **Contexto de Build**: Raiz do repositório
- **Porta**: 80
- **Variáveis de Ambiente**:
  ```
  VITE_API_URL=https://api.seu-dominio.com/api
  ```
  **Nota**: Ajuste a URL da API conforme seu domínio configurado no Easypanel
- **Dependências**: `painelcrm-backend`

### 2. Configurar Domínios

No Easypanel, configure os domínios:

- **Frontend**: `seu-dominio.com` → aponta para `painelcrm-frontend:80`
- **Backend API**: `api.seu-dominio.com` → aponta para `painelcrm-backend:3001`

### 3. Configurar Nginx do Frontend (Opcional)

Se você quiser que o frontend faça proxy para o backend, edite o `nginx.conf` antes do build:

```nginx
location /api {
    proxy_pass http://painelcrm-backend:3001;
    # ... resto da configuração
}
```

Ou configure o proxy no Easypanel usando o recurso de "Reverse Proxy".

### 4. Inicializar Banco de Dados

Após o primeiro deploy, você precisará executar os scripts SQL de inicialização:

1. Acesse o terminal do serviço `painelcrm-db` no Easypanel
2. Execute os scripts SQL na ordem:
   ```bash
   # Conecte ao banco
   psql -U postgres -d painelcrm
   
   # Execute os scripts (copie o conteúdo de cada arquivo em database/init/)
   # 01_create_users_and_auth.sql
   # 02_create_enums.sql
   # 03_create_permissions_and_roles.sql
   # ... e assim por diante
   ```

Ou use o volume do banco para copiar os scripts e executá-los.

### 5. Criar Usuário Admin

Após inicializar o banco, crie um usuário admin:

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

## Variáveis de Ambiente Importantes

### Backend
- `JWT_SECRET`: Gere um secret forte (ex: `openssl rand -base64 32`)
- `POSTGRES_PASSWORD`: Senha forte para o banco
- `FRONTEND_URL`: URL completa do frontend (para CORS)

### Frontend
- `VITE_API_URL`: URL completa da API backend

## Troubleshooting

### Backend não conecta ao banco
- Verifique se o serviço `painelcrm-db` está rodando
- Verifique se `POSTGRES_HOST` está correto (deve ser o nome do serviço no Easypanel)
- Verifique as credenciais do banco

### Frontend não carrega
- Verifique se `VITE_API_URL` está correto
- Verifique os logs do build
- Verifique se o nginx está rodando

### CORS errors
- Configure `FRONTEND_URL` no backend corretamente
- Verifique as configurações de CORS no backend

## Estrutura de Arquivos para Deploy

Certifique-se de que estes arquivos estão no repositório:
- `Dockerfile` (para backend)
- `Dockerfile.frontend` (para frontend)
- `nginx.conf` (para frontend)
- `packages/backend/package.json`
- `packages/backend/tsconfig.json`
- `package.json` (raiz, para frontend)
- `database/init/*.sql` (scripts de inicialização)

## Comandos Úteis

### Gerar JWT Secret
```bash
openssl rand -base64 32
```

### Gerar Hash de Senha (Node.js)
```javascript
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('sua-senha', 10);
console.log(hash);
```

## Próximos Passos

1. Configure os serviços no Easypanel
2. Configure os domínios
3. Execute os scripts SQL de inicialização
4. Crie o usuário admin
5. Teste o acesso ao sistema

