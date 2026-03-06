# Configuração de Variáveis de Ambiente

## 📋 Variáveis Necessárias

### Banco de Dados PostgreSQL
- `POSTGRES_HOST` - Host do PostgreSQL (padrão: `localhost`)
- `POSTGRES_PORT` - Porta do PostgreSQL (padrão: `5432`). **Se você já tem outro PostgreSQL na 5432**, use outra porta (ex.: `5433`, `5434`) no `.env`; o Docker expõe essa porta e o backend conecta nela.
- `POSTGRES_DB` - Nome do banco de dados (padrão: `painelcrm`)
- `POSTGRES_USER` - Usuário do PostgreSQL (padrão: `postgres`)
- `POSTGRES_PASSWORD` - Senha do PostgreSQL (padrão: `postgres`)

### API
- `API_PORT` - Porta da API (padrão: `3001`)
- `NODE_ENV` - Ambiente de execução (`development` ou `production`)

### JWT (Autenticação)
- `JWT_SECRET` - Chave secreta para assinar tokens JWT (⚠️ **OBRIGATÓRIO em produção**)
- `JWT_EXPIRES_IN` - Tempo de expiração do token (padrão: `7d`)

### Frontend
- `FRONTEND_URL` - URL do frontend para CORS (padrão: `http://localhost:5173`)

---

## 🏠 Desenvolvimento Local

### 1. Criar arquivo `.env`

Copie o arquivo de exemplo:

```bash
cp packages/backend/.env.example packages/backend/.env
```

### 2. Editar `.env`

Edite o arquivo `packages/backend/.env` com suas configurações locais:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=painelcrm
POSTGRES_USER=postgres
POSTGRES_PASSWORD=sua-senha-aqui

API_PORT=3001
NODE_ENV=development

JWT_SECRET=chave-secreta-local-desenvolvimento
JWT_EXPIRES_IN=7d

FRONTEND_URL=http://localhost:5173
```

### 3. Iniciar PostgreSQL Local

Se estiver usando Docker Compose:

```bash
docker-compose up -d postgres
```

Ou configure um PostgreSQL local.

### Porta diferente quando há outro PostgreSQL

Se outro projeto ou instalação já usa a porta **5432**, você pode rodar os dois ao mesmo tempo mudando a porta deste projeto:

1. No **`.env`** (na raiz do projeto), defina por exemplo:
   ```env
   POSTGRES_PORT=5433
   ```
   (ou `5434`, `5435`, etc., o que estiver livre.)

2. O **docker-compose** já usa `${POSTGRES_PORT:-5432}:5432`: o primeiro número é a porta no seu PC, o segundo é a porta dentro do container. Com `POSTGRES_PORT=5433`, o banco fica acessível em `localhost:5433`.

3. O **backend** e os scripts de migração leem `POSTGRES_PORT` do `.env`, então passam a conectar na nova porta.

4. Reinicie o container do banco depois de alterar o `.env`:
   ```bash
   docker-compose down
   docker-compose up -d postgres
   ```

Assim, um PostgreSQL fica na 5432 (outro projeto) e este na 5433 (ou na porta que você escolher).

---

## ☁️ Easypanel (Produção)

### ⚠️ IMPORTANTE: NÃO use arquivo `.env` no Easypanel!

No Easypanel, as variáveis de ambiente são configuradas **diretamente no painel**, não via arquivo `.env`.

### Configuração no Easypanel

1. **Acesse o serviço Backend** no Easypanel
2. **Vá em "Environment Variables"** ou "Variáveis de Ambiente"
3. **Adicione as seguintes variáveis**:

```
POSTGRES_HOST=painelcrm-db
POSTGRES_PORT=5432
POSTGRES_DB=painelcrm
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<senha-do-postgres>
API_PORT=3001
NODE_ENV=production
JWT_SECRET=<gere-um-secret-forte>
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://seu-dominio.com
```

### ⚠️ Observações Importantes

1. **POSTGRES_HOST**: Use o **nome do serviço PostgreSQL** criado no Easypanel (ex: `painelcrm-db`)
2. **JWT_SECRET**: Gere uma chave forte e segura:
   ```bash
   openssl rand -base64 32
   ```
3. **FRONTEND_URL**: Use a URL completa do seu frontend (ex: `https://painelcrm.com`)
4. **POSTGRES_PASSWORD**: Use a senha configurada no serviço PostgreSQL do Easypanel

### Criar Serviço PostgreSQL no Easypanel

1. **Criar serviço PostgreSQL**:
   - Tipo: PostgreSQL
   - Nome: `painelcrm-db` (ou outro nome de sua escolha)
   - Versão: 15
   - Variáveis:
     - `POSTGRES_USER`: `postgres`
     - `POSTGRES_PASSWORD`: `<sua-senha-forte>`
     - `POSTGRES_DB`: `painelcrm`

2. **Anotar o nome do serviço** para usar em `POSTGRES_HOST`

---

## 🔐 Segurança

### ❌ NUNCA faça:
- ❌ Commit arquivo `.env` no Git
- ❌ Compartilhar `JWT_SECRET` em produção
- ❌ Usar senhas fracas

### ✅ SEMPRE faça:
- ✅ Use `.env.example` como template
- ✅ Mantenha `.env` no `.gitignore`
- ✅ Gere `JWT_SECRET` forte para produção
- ✅ Use senhas fortes para PostgreSQL

---

## 🧪 Testar Conexão

Após configurar as variáveis, teste a conexão:

```bash
# No diretório do backend
cd packages/backend
npm run dev
```

Você deve ver:
```
Connected to PostgreSQL database
Server running on port 3001
```

---

## 📝 Checklist

### Desenvolvimento Local
- [ ] Copiar `.env.example` para `.env`
- [ ] Configurar variáveis no `.env`
- [ ] PostgreSQL rodando localmente
- [ ] Testar conexão

### Easypanel (Produção)
- [ ] Criar serviço PostgreSQL no Easypanel
- [ ] Configurar variáveis de ambiente no serviço Backend
- [ ] Usar nome do serviço PostgreSQL em `POSTGRES_HOST`
- [ ] Gerar `JWT_SECRET` forte
- [ ] Configurar `FRONTEND_URL` corretamente
- [ ] Testar conexão após deploy

