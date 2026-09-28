# Próximos passos – Configuração e início do Painel CRM

**Branch atual:** `deploy-v1.1.2.7`  
**Banco:** PostgreSQL já migrado (Docker, porta 5433)

---

## 1. O que já está feito

- [x] Repositório atualizado no branch **deploy-v1.1.2.7**
- [x] PostgreSQL rodando em Docker (container `painelcrm_postgres`, porta **5433**)
- [x] Migrações aplicadas (50 tabelas criadas por `database/init/`)
- [x] Usuário admin de teste: `admin@painelcrm.com` / senha **admin123**
- [x] `.env` configurado com `POSTGRES_PORT=5433` e sua senha do banco

---

## 2. Instalar dependências

Na raiz do projeto (`c:\CURSOR\painelcrm`):

```powershell
# Backend
cd packages\backend
npm install
cd ..\..

# Frontend (raiz)
npm install
```

---

## 3. Iniciar backend e frontend

**Terminal 1 – Backend**

```powershell
cd c:\CURSOR\painelcrm\packages\backend
npm run dev
```

- API em: **http://localhost:3001**
- Confirme no log: `Connected to PostgreSQL database`

**Terminal 2 – Frontend**

```powershell
cd c:\CURSOR\painelcrm
npm run dev
```

- Frontend em: **http://localhost:8080** (conforme `FRONTEND_URL` no `.env` do branch)

---

## 4. Testar acesso

1. Abra **http://localhost:8080**
2. Login com o admin: **admin@painelcrm.com** / **admin123**
3. Ou use “Registre-se” para criar outra conta

---

## 5. Configurações opcionais (depois que estiver rodando)

| O que configurar | Onde | Observação |
|------------------|------|------------|
| **JWT_SECRET** | `.env` | Em produção use um valor forte e único |
| **FRONTEND_URL** | `.env` | Já está `http://localhost:8080` |
| **VITE_API_URL** | `.env` | Já está `http://localhost:3001` para o front chamar a API |
| **Senha do admin** | Script ou SQL | Ver `ATUALIZAR-SENHA-ADMIN.md` ou `packages/backend/scripts/update-admin-password.mjs` |
| **WhatsApp / Evolution** | App | Após login, nas configurações do sistema |

---

## 6. Comandos úteis

```powershell
# Status do banco
docker ps --filter "name=painelcrm_postgres"

# Parar banco
docker-compose stop postgres

# Subir banco de novo
docker-compose up -d postgres

# Health check da API (com backend rodando)
curl http://localhost:3001/health
```

---

## 7. Se algo der errado

- **Backend não conecta ao banco:** confira no `.env`: `POSTGRES_HOST=localhost`, `POSTGRES_PORT=5433`, usuário e senha.
- **Porta em uso:** altere `API_PORT` no `.env` (backend) ou a porta do Vite (frontend).
- **Módulo não encontrado:** em `packages/backend` e na raiz, rode `npm install` de novo.

Quando o backend e o frontend estiverem rodando e o login funcionando, você pode seguir com as configurações de negócio (usuários, produtos, WhatsApp, etc.) dentro do próprio painel.
