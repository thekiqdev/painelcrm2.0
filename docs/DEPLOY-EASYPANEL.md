# Deploy no Easypanel

## 502 ao acessar /api (login, cadastro, planos)

O frontend faz proxy de `/api` para o **backend**. O hostname do backend é configurado pela variável de ambiente **BACKEND_HOST** no serviço do **frontend**.

### Passo 1: Definir BACKEND_HOST no frontend

1. No Easypanel, abra o **serviço do frontend** (painelcrm-frontend).
2. Em **Variáveis de ambiente**, adicione:
   - **Nome:** `BACKEND_HOST`
   - **Valor:** nome do serviço do backend no Easypanel.

Valores comuns:

- `painelcrm-backend` (se o serviço do backend se chama assim)
- `painelcrm_painelcrm-backend` (padrão projeto_serviço no Easypanel; use se o primeiro não resolver)
- `backend` (se você usa esse nome no painel)

3. Salve e faça **redeploy do frontend**.

### Passo 2: Se ainda der 502

- Confira os **logs do backend**: o container pode estar caindo ao subir (ex.: erro ao conectar no PostgreSQL).
- No Easypanel, abra o serviço do **backend** e veja os logs de startup.
- Confirme que a **migração** foi rodada no backend (`npm run migrate` ou `node dist/migrate.js` dentro do container do backend).
- Confirme que o **banco** está acessível (variáveis `POSTGRES_*` corretas no backend).

### JWT e primeiro acesso

- No **backend**, defina a variável **JWT_SECRET** com um valor forte (não use `<gere-um-secret-forte>` em produção). Para gerar: `openssl rand -base64 48` ou use um gerador seguro.
- O primeiro acesso pode ser pelo **cadastro** na aplicação; se existir `create-admin-user.sql` na migração, o usuário admin pode ter sido criado por ele (ex.: admin@painelcrm.com depende do seed).

---

## Migração do banco

Dentro do container do **backend**:

```bash
npm run migrate
# ou
node dist/migrate.js
```

---

## Criar Super Admin

Dentro do **container do backend** (após a migração), o script está em `scripts/create-superadmin.mjs`. Use uma destas formas:

**Com email e senha na linha de comando:**

```bash
node scripts/create-superadmin.mjs seu@email.com SuaSenhaSegura
```

**Com variáveis de ambiente** (defina `SUPERADMIN_EMAIL` e `SUPERADMIN_PASSWORD` no Easypanel no serviço do backend, ou ao executar o comando):

```bash
node scripts/create-superadmin.mjs
```

O script usa as mesmas variáveis de banco do backend (`POSTGRES_HOST`, `POSTGRES_DB`, etc.). Se rodar em um one-off container, passe as variáveis ou use o mesmo env do serviço.

---

## Imagem hero-dashboard.jpg (404)

Se aparecer 404 em `/landingpage/hero-dashboard.jpg`, é um asset que não está no build atual (ou veio de cache). Pode ser ignorado ou adicionar a imagem em `public/landingpage/` e dar novo build do frontend.
