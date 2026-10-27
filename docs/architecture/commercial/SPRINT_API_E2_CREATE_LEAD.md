# API Etapa 2 — Cadastrar lead com a chave — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-27 |
| **Etapa** | **2** (**feito**) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_API_CHAVES_LEAD.md`](./PLAN_IMPLANTACAO_API_CHAVES_LEAD.md) |
| **Anterior** | [`SPRINT_API_E1_API_KEYS.md`](./SPRINT_API_E1_API_KEYS.md) |
| **Próximo** | Etapa 3 **feita** → [`SPRINT_API_E3_UI.md`](./SPRINT_API_E3_UI.md) · seguinte: `ok api etapa 4` |

---

## Objetivo

`POST /api/v1/leads` com a chave cria o lead no CRM do dono. O `POST /api/leads` do painel (JWT) permanece o mesmo contrato.

A flag `api.keys_v1` continua **off**: chave válida com flag desligada responde **404**.

---

## Entregas

### Banco

`database/init/356_api_idempotency_keys.sql` — replay por `(api_key_id, idem_key)`, janela de 24 h. Não guarda o segredo.

### Lead compartilhado

`packages/backend/src/services/leadCreateService.ts`

- `prepareLeadFields` + `insertLead` — o painel chama com source default `Outros` e status livre
- A API chama com source default `API`, `profile_id` sempre nulo, e `status` só se existir em `lead_statuses` do dono

`leadsController.createLead` passou a usar esse serviço. Permissões JWT (`leads.create`) ficaram no controller.

### `POST /api/v1/leads`

Sem `tenantAuthCrm`. Montado em `app.use('/api/v1', …)`.

| Checagem | Resposta |
|----------|----------|
| Chave ausente, inválida ou revogada | **401** `API key inválida.` |
| Flag off | **404** `API_KEYS_DISABLED` |
| Sem escopo `leads.create` | **403** `API_KEY_SCOPE` |
| Trial encerrado | **403** `TRIAL_EXPIRED` (mesmo gate do CRM) |
| `plan_period_end` no passado | **402** `PLAN_EXPIRED` |
| CPF/CNPJ, nome, e-mail, campo `user_id` / `profile_id` / `tenant_id` | **400** |
| Status que não é fase do dono | **400** |
| `Idempotency-Key` repetida, mesmo corpo | a mesma resposta, sem segundo lead |
| `Idempotency-Key` repetida, corpo diferente | **409** `IDEMPOTENCY_CONFLICT` |
| Acima de 60 req/min por prefixo da chave | **429** `RATE_LIMITED` |

Header: `Authorization: Bearer pcrm_…` ou `X-Api-Key`. JWT de sessão nesse Bearer não autentica.

A leitura da chave abre transação com bypass de RLS, depois fixa `app.current_tenant_id` do dono para o insert. `last_used_at` atualiza quando a chave passa da flag, do escopo e do plano. O log de erro não grava o segredo.

O limiter global de `/api/` (por IP) continua valendo.

### Testes

`npx vitest run src/apiKeys src/services/leadCreateService.test.ts` — 38 testes, incluindo 401, 403 de escopo, 400 de CPF, status inexistente e replay idempotente.

---

## Fora desta etapa

- Tela em `/settings/api` (Etapa 3)
- Ligar a flag no piloto e limpar idempotência antiga (Etapa 4)

---

## DoD

- [x] Lead criado com `user_id` do dono da chave e source `API` se a origem vier vazia
- [x] Resposta pública sem `user_id` / `profile_id`
- [x] `POST /api/leads` continua com JWT, permissão e source default `Outros`
- [x] Chave revogada ou inválida → 401
- [x] Flag off → 404
- [x] Idempotência não duplica o lead

---

## Kickoff próximo

`ok api etapa 3` — secção API em Configurações → Integrações (`/settings/api`): gerar, copiar uma vez, listar, revogar e exemplo de `curl`.
