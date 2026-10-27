# API Etapa 1 — Chave: persistência e gestão — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-27 |
| **Etapa** | **1** (**feito**) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_API_CHAVES_LEAD.md`](./PLAN_IMPLANTACAO_API_CHAVES_LEAD.md) |
| **Anterior** | [`SPRINT_API_E0_INVENTORY.md`](./SPRINT_API_E0_INVENTORY.md) |
| **Próximo** | Etapa 2 **feita** → [`SPRINT_API_E2_CREATE_LEAD.md`](./SPRINT_API_E2_CREATE_LEAD.md) · seguinte: `ok api etapa 3` |

---

## Objetivo

O admin do tenant gera, lista e revoga chave. O segredo não fica recuperável. Com a flag desligada, as rotas respondem 404.

`POST /api/v1/leads` **não** entra nesta etapa.

---

## Entregas

### Banco

`database/init/355_api_keys.sql` (ordem em `migrationOrder.ts`):

- Tabela `api_keys`: tenant, dono (`ON DELETE CASCADE`), nome, prefixo (12), hash SHA-256 único, `scopes`, `last_used_at`, `revoked_at`
- RLS por `tenant_id`
- Flag `api.keys_v1`, namespace `api`, `default_enabled=false`, `rollout_type=off`

### Backend

| Peça | Path |
|------|------|
| Flag | `packages/backend/src/apiKeys/apiKeyFlags.ts` — DB vence; `API_KEYS_V1` só se a linha não existir |
| Segredo | `apiKeyCrypto.ts` — `pcrm_` + 32 bytes base64url; guarda só SHA-256 |
| Serviço | `apiKeyService.ts` — create, list, revoke, `resolveApiKey` |
| HTTP | `POST/GET/DELETE /api/integrations/api-keys` |
| Gate | `tenantAuthCrm` → flag → `isTenantAdmin` |

Resposta do POST inclui `key` uma vez. GET devolve `{ keys: [...] }` sem segredo e sem hash. DELETE preenche `revoked_at` (não apaga a linha). Chave de outro tenant → 404. `resolveApiKey` devolve null se revogada ou se o hash não bate.

Escopo gravado nesta etapa: sempre `leads.create`. O body não escolhe escopo.

### Testes

`npx vitest run src/apiKeys` — 14 testes: hash ≠ segredo, lista sem segredo, revoke filtrado por tenant, resolve recusa revogada, flag off → 404, não-admin → 403.

---

## Fora desta etapa

- Tela em `/settings/api` (Etapa 3)
- `POST /api/v1/leads` (Etapa 2)
- A flag continua **off**. Ligar no piloto é a Etapa 4 (override do tenant no Super Admin)

### Nota para a Etapa 2

`resolveApiKey` lê `api_keys` pelo prefixo, antes de saber o tenant. A policy RLS exige `app.current_tenant_id` ou bypass. O `POST /api/v1` não tem JWT, então o middleware dessa etapa precisa consultar a chave numa conexão com bypass de RLS e, em seguida, abrir o contexto do tenant dono. Não logar `Authorization` nem `X-Api-Key`.

---

## DoD

- [x] POST devolve `pcrm_…` uma vez; o INSERT recebe o hash, não o segredo
- [x] GET não traz segredo nem hash
- [x] DELETE revoga; `resolveApiKey` passa a devolver null
- [x] Lista e revoke filtram `tenant_id`
- [x] Flag off → 404 `API_KEYS_DISABLED`
- [x] Quem não é admin do tenant → 403
- [x] Flag nomeada em `featureFlagKeys.ts` e seed default off

---

## Kickoff próximo

`ok api etapa 2` — `leadCreateService` + `POST /api/v1/leads` com a chave.
