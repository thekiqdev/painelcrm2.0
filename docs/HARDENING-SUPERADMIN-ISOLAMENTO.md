# Hardening — isolamento Super Admin vs CRM (tenant)

## 1. Problema identificado

Usuários **super admin de plataforma** (`users.is_super_admin = true` e `users.tenant_id` nulo) conseguiam:

- autenticar e usar o **dashboard / CRM** como um usuário comum;
- chamar APIs tenant-scoped (`/api/clients`, `/api/leads`, `/api/chat`, etc.) e **criar dados órfãos** (`clients.user_id` sem `tenant_id` no dono).

Isso violava o modelo multi-tenant e gerava inconsistência (ver `CLASSIFICACAO-CLIENTES-SUPERADMIN-SEM-TENANT.md`).

## 2. Solução aplicada

### Backend

- Novo middleware **`requireTenantForBusinessApp`**: se `req.tenantId` estiver ausente, responde **403** com `{ "error": "TENANT_REQUIRED_FOR_OPERATION" }`.
- Nova cadeia **`tenantAuthCrm`**: `authenticateToken` → `setCurrentTenant` → **`requireTenantForBusinessApp`** → `requireActivePlanPeriod` → `setRequestDb`.
- Rotas de **negócio / CRM** passam a usar **`tenantAuthCrm`** em vez de `tenantAuth`.
- Rotas que **não** usam `tenantAuthCrm` (permanecem com `tenantAuth` ou sem exigência de tenant):
  - `/api/auth/*` (`/me`, `/me/features`, `logout`)
  - `/api/profile`, `/api/user-profiles/.../members` (perfis pessoais / membros sem exigir tenant no mesmo nível — ver nota abaixo)
  - `/api/me/tenant/*` (plano e permissões da conta — super admin sem tenant pode receber erro de negócio nas telas que chamam isso; no front o redirecionamento evita o CRM)
  - `/api/superadmin/*` (usa `superadminAuth`, inalterado)
  - Webhooks, rotas públicas, `plan-purchase` com auth opcional, etc.

**Nota:** `/api/user-profiles` e sub-rotas de permissões passaram a **`tenantAuthCrm`**: perfis da **empresa** no CRM exigem tenant. Super admin sem tenant não deve depender dessas APIs no dia a dia (área `/superadmin`).

### Login

- **`POST /api/auth/login`**: resposta `user` inclui **`tenant_id`** (além de `is_super_admin`, já existente).
- **`GET /api/auth/me`**: já expunha `tenant_id` e `is_super_admin`; mantido.

### Frontend

- Utilitário **`src/utils/superAdminRedirect.ts`**:
  - `isSuperAdminPlatformUser` — `is_super_admin` e sem `tenant_id`;
  - `getPostAuthHomePath` — destino pós-login: `/superadmin` vs `/register/steps` vs `/dashboard`;
  - `isTenantCrmPath` + lista de prefixos — para redirecionar super admin plataforma para fora do CRM.
- **`signIn`** retorna a **rota de destino**; `Login`, `AuthWhatsApp`, `AuthModal` fazem `navigate(dest, { replace: true })` sem passar pelo dashboard quando for super admin plataforma.
- **`AuthGuard`**: se super admin plataforma acessar prefixo de CRM (ex.: `/dashboard`, `/chat`, `/clients`, `/leads`, …), redireciona para **`/superadmin`**; não força `/register/steps` para esse perfil; trata `/onboarding` e `/register/steps` como rotas a evitar para esse usuário.

## 3. Endpoints protegidos (resumo)

Todos os routers que passaram de `tenantAuth` para **`tenantAuthCrm`** (lista não exaustiva de prefixos em `index.ts`):

- `/api/clients`, `/api/client-groups`
- `/api/leads`, `/api/lead-statuses`, `/api/lead-tasks`
- `/api/funnels`, `/api/funnels` (estágios)
- `/api/chat`
- `/api/customer-invoices`, `/api/customer-charges`
- `/api/dashboard`
- `/api/projects`, listas, áreas, tarefas, templates
- `/api/products`, `/api/proposals`, `/api/contracts`, `/api/contract-templates`
- `/api/tasks`, `/api/tickets`, `/api/ticket-categories`
- `/api/teams`, `/api/members`
- `/api/invoices`, `/api/expenses`, `/api/finance`
- `/api/orders`, `/api/cart`
- `/api/store-profile`
- `/api/search`, `/api/notifications`, `/api/messages`, `/api/message-templates`
- `/api/user-profiles`, `/api/user-profiles` (permissões)
- `/api/registration-steps`
- `/api/onboarding` (rotas autenticadas após `create-admin`)

**Não** alterados para `tenantAuthCrm`: `profileRoutes`, `profileMembersRoutes`, `myTenantPlanRoutes`, `authRoutes`.

## 4. Fluxo de login atualizado

1. Usuário envia credenciais → `POST /api/auth/login`.
2. Resposta inclui `user.is_super_admin` e `user.tenant_id`.
3. Front chama `GET /api/auth/me` (como já fazia após login) e calcula destino com **`getPostAuthHomePath`**.
4. Se **super admin plataforma** → **`/superadmin`** (replace).
5. Caso contrário → fluxo existente (`/register/steps` se cadastro incompleto, senão `/dashboard`, etc.).

Refresh com token salvo: `fetchCurrentUser` + `AuthGuard` aplicam as mesmas regras de rota.

## 5. Riscos e limitações

| Risco | Mitigação |
|-------|-----------|
| Super admin **com** `tenant_id` (ex.: mesmo usuário também membro de uma conta) | Continua podendo usar o CRM — é intencional (`tenantId` presente). |
| Lista de prefixos CRM no front desatualizada | Novas rotas sob `AppLayout` devem ser adicionadas em `TENANT_CRM_PATH_PREFIXES` se precisarem bloquear super admin plataforma. |
| Super admin abre URL não coberta (ex.: rota sem `AuthGuard`) | Backend **`tenantAuthCrm`** ainda bloqueia mutações/leituras nas APIs CRM listadas. |
| `ModulePermissionsProvider` chama `/api/me/tenant/my-permissions` | Falha silenciosa vira `{}`; super admin em `/superadmin` não depende do menu CRM. |
| Onboarding em `/onboarding` sem `AuthGuard` | Super admin raro; APIs autenticadas de onboarding usam `tenantAuthCrm` (403 sem tenant). |

## 6. Como validar

1. **Super admin sem tenant** (`admin@painelcrm.com` em dev): login → cai em **`/superadmin`**, não em `/dashboard`.
2. Tentar `POST /api/clients` com token desse usuário → **403** `TENANT_REQUIRED_FOR_OPERATION`.
3. Colar `/dashboard` ou `/clients` na barra de endereço logado como esse usuário → redireciona para **`/superadmin`**.
4. Usuário **normal com tenant**: login → `/dashboard` (ou onboarding); APIs CRM **200** como antes.
5. **`POST /api/superadmin/...`** com token super admin → inalterado (não usa `tenantAuthCrm`).
6. **`GET /api/auth/me`** com token super admin sem tenant → **200** com `tenant_id: null`.

## 7. Alterações de banco / RLS

Nenhuma. Apenas código de aplicação e documentação.
