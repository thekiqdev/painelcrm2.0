# Plano de implantação — API pública (chave) e cadastro de lead

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-27 |
| **Tipo** | Plano de implantação por etapas (produto + API + QA) |
| **Nome** | **API-Go — Chave de API e cadastro de lead** |
| **Objetivo** | O admin do tenant **gera uma chave**; um sistema externo usa essa chave para **cadastrar lead no CRM** |
| **Decisão** | Superfície nova `/api/v1`, autenticada por chave. A API de sessão (`/api/leads` + JWT) **não muda** |
| **MVP** | Só **criar lead**. A chave já nasce com escopos, para outras ações depois |
| **Status** | **Etapa 4 feita** (2026-10-27) — API ligada por padrão para todos os tenants |
| **Kickoff** | — |
| **Closeout E0** | [`SPRINT_API_E0_INVENTORY.md`](./SPRINT_API_E0_INVENTORY.md) |
| **Closeout E1** | [`SPRINT_API_E1_API_KEYS.md`](./SPRINT_API_E1_API_KEYS.md) |
| **Closeout E2** | [`SPRINT_API_E2_CREATE_LEAD.md`](./SPRINT_API_E2_CREATE_LEAD.md) |
| **Closeout E3** | [`SPRINT_API_E3_UI.md`](./SPRINT_API_E3_UI.md) |
| **Closeout E4** | [`SPRINT_API_E4_GOLIVE.md`](./SPRINT_API_E4_GOLIVE.md) |

---

## 1. Meta (MVP desta implantação)

O admin do tenant, em **Configurações → Integrações → API**:

1. Cria uma chave com um nome (ex.: `Site`, `RD Station`, `Planilha`).
2. Copia o segredo **uma única vez** (`pcrm_…`).
3. O sistema externo chama `POST /api/v1/leads` com essa chave.
4. O lead aparece no CRM do tenant, no usuário dono da chave, com a mesma validação do cadastro manual.

**Não-objetivo deste MVP**

| Fora | Motivo |
|------|--------|
| Listar, editar ou apagar lead pela API | Próximas ações; o escopo da chave já reserva isso |
| Cliente, tarefa, proposta, mensagem | Mesmo motivo |
| OAuth, JWT de integração, webhook de saída | Chave estática cobre o primeiro caso |
| Deduplicar por telefone/e-mail | O painel também não deduplica no `POST /api/leads` |
| Chave de teste vs produção | Uma chave por registro; revogar e gerar outra |
| Superadmin / Partner / plataforma | Chave é **do tenant** |

---

## 2. O que a chave abre

| Chamada | Quem | Comportamento |
|---------|------|----------------|
| `POST /api/integrations/api-keys` | Admin do tenant (sessão) | Gera chave; devolve o segredo só nesta resposta |
| `GET /api/integrations/api-keys` | Admin do tenant | Lista nome, prefixo, escopos, último uso, revogada ou não |
| `DELETE /api/integrations/api-keys/:id` | Admin do tenant | Revoga na hora |
| `POST /api/v1/leads` | Chave com escopo `leads.create` | Cria lead no tenant da chave |

**Não abre:** o restante de `/api/*`. Chave inválida, revogada ou sem o escopo recebe **401/403** e não cai no login JWT.

Sem chave, o cadastro continua só pelo painel (`POST /api/leads`).

---

## 3. Arquitetura

```
Admin (sessão JWT, tenant admin)
  POST /api/integrations/api-keys
       → gera pcrm_<segredo>
       → grava só SHA-256 + prefixo
       → responde o segredo uma vez

Sistema externo
  POST /api/v1/leads
  Authorization: Bearer pcrm_…
       → middleware: prefixo → hash → escopo leads.create
       → plano do tenant ainda ativo (mesmo gate comercial do CRM)
       → leadCreateService (mesma regra do painel)
       → INSERT leads.user_id = dono da chave
```

A lógica de validação e insert sai de `leadsController.createLead` para um serviço compartilhado. O controller da sessão e o controller da API chamam o mesmo serviço. A rota antiga permanece em `packages/backend/src/routes/leadsRoutes.ts` (`tenantAuthCrm` + `leads.create`).

### Contrato do lead (público)

`POST /api/v1/leads`

```http
Authorization: Bearer pcrm_…
Content-Type: application/json
Idempotency-Key: <opcional, até 128 chars>
```

```json
{
  "name": "Maria Souza",
  "email": "maria@empresa.com",
  "phone": "11999998888",
  "company": "Empresa Ltda",
  "source": "Website",
  "status": "Novo",
  "observacao": "Veio do formulário",
  "cpf_cnpj": "12345678901"
}
```

| Campo | Regra |
|-------|--------|
| `name` | Obrigatório |
| `email`, `phone`, `company`, `observacao`, `cpf_cnpj` | Opcionais, os mesmos do cadastro. `observacao` é o texto do campo Observação. CPF 11 ou CNPJ 14 dígitos |
| `source` | Opcional. Se vazio, gravar **`API`** (no painel o default continua `Outros`) |
| `status` | Opcional. Se enviado, tem de ser um nome de `lead_statuses` do dono da chave. Se omitido, `null` |
| `user_id`, `profile_id`, `tenant_id` | **Recusados**. O dono é o `owner_user_id` da chave |

**201**

```json
{
  "id": "uuid",
  "name": "Maria Souza",
  "email": "maria@empresa.com",
  "phone": "11999998888",
  "company": "Empresa Ltda",
  "source": "API",
  "status": null,
  "observacao": null,
  "cpf_cnpj": "12345678901",
  "created_at": "2026-10-27T14:00:00.000Z"
}
```

Erros estáveis para o integrador: `401` chave ausente/inválida/revogada · `403` sem escopo ou plano inativo · `400` validação · `409` mesma `Idempotency-Key` com corpo diferente · `429` limite · `402` período do plano expirado (mesmo critério de `requireActivePlanPeriod`).

`X-Api-Key: pcrm_…` é aceito como alias do Bearer.

### Chave

| Item | Decisão |
|------|---------|
| Formato | `pcrm_` + 32 bytes em base64url |
| Guarda | `key_hash` = SHA-256 hex; `key_prefix` = primeiros 12 caracteres (`pcrm_` + 7) para a lista e o lookup |
| Segredo | Só na resposta do POST de criação. Lista nunca devolve hash nem segredo |
| Dono | `owner_user_id` = admin que gerou. Lead nasce com esse `user_id` |
| Escopo inicial | `leads.create` fixo nesta implantação. Coluna `scopes text[]` já existe para o próximo recurso |
| Revogação | `revoked_at` preenchido; a próxima chamada falha |
| Comparação | Busca por prefixo, confere hash com comparação em tempo constante |

### Tabela (migration `355_api_keys.sql`)

Incluir em `packages/backend/src/startup/migrationOrder.ts` depois de `354_tenant_edge_cloudflare_saas_te2.sql`.

`api_keys`: `id`, `tenant_id`, `owner_user_id`, `created_by`, `name`, `key_prefix`, `key_hash` (único), `scopes`, `last_used_at`, `revoked_at`, `created_at`, `updated_at`. RLS por tenant, no padrão de `57_rls_tenant_isolation.sql`.

`api_idempotency_keys`: `api_key_id`, `idem_key`, `request_hash`, `status_code`, `response_body`, `created_at`. Único `(api_key_id, idem_key)`. Reenvio com o mesmo corpo devolve a mesma resposta. Corpo diferente → `409`. Janela de 24 h. A Etapa 4 apaga as linhas mais velhas de hora em hora.

---

## 4. Etapas de implantação

### Etapa 0 — Travar decisões + inventário

| Campo | Valor |
|-------|-------|
| **Objetivo** | Fechar contrato, dono do lead, flag e onde a UI entra |
| **Entregas** | Decisões API0.1–API0.15 · inventário das escritas de lead · flag só nomeada (seed na Etapa 1) |
| **DoD** | Escopo “só criar lead” aceito · campos do JSON fechados · dono = quem gerou a chave |
| **Status** | **Feito** (2026-10-27) — [`SPRINT_API_E0_INVENTORY.md`](./SPRINT_API_E0_INVENTORY.md) |

**Checklist**

- [x] Contrato §3 aceito (`name` obrigatório, source default `API`, sem `user_id` no body)
- [x] Flag `api.keys_v1` nomeada (namespace `api`). Na Etapa 4 ficou **ligada para todos** (`rollout_type=global`)
- [x] Gestão da chave só para `isTenantAdmin`
- [x] UI em Configurações → Integrações, path `/settings/api` (slug livre)
- [x] Inventário: `createLead` é o caminho do painel; kanban, chatbot e portal também inserem lead e **ficam de fora**

**Kickoff:** ~~`ok api etapa 0`~~ **feito**

---

### Etapa 1 — Chave: persistência e gestão (sessão)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Admin gera, lista e revoga chave. Segredo não fica recuperável |
| **Entregas** | Migration 355 · `POST/GET/DELETE /api/integrations/api-keys` · testes: segredo só no create, hash no banco, revogada some do auth, outro tenant não vê |
| **DoD** | Criar devolve `pcrm_…` uma vez · GET não traz segredo · DELETE impede uso · flag off → 404 nestas rotas |
| **Status** | **Feito** (2026-10-27) — [`SPRINT_API_E1_API_KEYS.md`](./SPRINT_API_E1_API_KEYS.md) |

**Kickoff:** ~~`ok api etapa 1`~~ **feito**

---

### Etapa 2 — `POST /api/v1/leads`

| Campo | Valor |
|-------|-------|
| **Objetivo** | Chave válida cadastra lead com a mesma regra do painel |
| **Entregas** | `leadCreateService` extraído do controller · middleware da chave (prefixo, hash, escopo, plano ativo, `last_used_at`) · rota `/api/v1/leads` **sem** `tenantAuthCrm` · rate limit próprio (60 req/min por chave) · `Idempotency-Key` · testes de sucesso, 401, 403 sem escopo, 400 CPF, status inexistente, replay idempotente |
| **DoD** | Lead visível no CRM do dono · `POST /api/leads` com JWT segue igual · chave revogada → 401 · flag off → 404 |
| **Status** | **Feito** (2026-10-27) — [`SPRINT_API_E2_CREATE_LEAD.md`](./SPRINT_API_E2_CREATE_LEAD.md) |

Montar `/api/v1` em `packages/backend/src/index.ts` fora da cadeia JWT. O limiter global de `/api/` continua; o limiter da chave é adicional.

**Kickoff:** ~~`ok api etapa 2`~~ **feito**

---

### Etapa 3 — UI: gerar e usar a chave

| Campo | Valor |
|-------|-------|
| **Objetivo** | Admin faz o fluxo sem chamar a API de gestão no escuro |
| **Entregas** | Secção API no menu de configurações · criar (nome) · modal “copie agora” · lista (nome, prefixo, criado em, último uso) · revogar com confirmação · bloco com `curl` do `POST /api/v1/leads` · textos em `pt-BR` (e chaves i18n se o ecrã de settings já exigir) |
| **DoD** | Gerar → copiar → revogar no browser · exemplo de curl bate com o contrato §3 · flag off esconde a secção |
| **Status** | **Feito** (2026-10-27) — [`SPRINT_API_E3_UI.md`](./SPRINT_API_E3_UI.md) |

**Kickoff:** ~~`ok api etapa 3`~~ **feito**

---

### Etapa 4 — Hardening e go-live

| Campo | Valor |
|-------|-------|
| **Objetivo** | Ligar para todos os tenants, com rastreio mínimo e sem vazar segredo |
| **Entregas** | Flag `api.keys_v1` global · log de uso sem corpo e sem chave (key id, rota, status) · limpeza de idempotência > 24 h · nota de integração no §3 · checklist §5 |
| **DoD** | Admin de qualquer tenant gera a chave e o `curl` do painel cria o lead · segredo não aparece em log · revogação corta a chamada seguinte |
| **Status** | **Feito** (2026-10-27) — [`SPRINT_API_E4_GOLIVE.md`](./SPRINT_API_E4_GOLIVE.md) |

**Kickoff:** ~~`ok api etapa 4`~~ **feito** — ligada por padrão para todos, não só para um piloto

---

## 5. Checklist go-live (fim Etapa 4)

- [x] Flag `api.keys_v1` ligada por padrão para todos os tenants. Override no Super Admin desliga só aquela conta
- [x] Segredo exibido uma vez; banco só tem hash
- [x] Chave de um tenant não cria lead em outro
- [x] `POST /api/v1/leads` grava `user_id` do dono e `source` default `API`
- [x] Status fora da lista do dono → 400
- [x] Plano expirado → 402, igual ao CRM
- [x] Revogar → próxima chamada 401
- [x] `Idempotency-Key` repetida não duplica o lead
- [x] `POST /api/leads` (painel) inalterado
- [x] Rate limit 429 sem derrubar o restante da API

---

## 6. Variáveis e flags

| Item | Uso |
|------|-----|
| `api.keys_v1` | Liga gestão da chave e `POST /api/v1/leads` para todos os tenants. Off (override) = 404 e menu oculto |
| `API_KEYS_V1` | Só se a linha não existir no banco. Com a migration aplicada, a linha existe e a env não muda o padrão |
| Escopo `leads.create` | Única ação desta implantação |
| Rate limit | 60 requisições/minuto por chave no `/api/v1` (além do limiter global por IP) |
| `Idempotency-Key` | Opcional; janela 24 h |

Não há secret novo de plataforma: o segredo é por tenant e nasce no painel.

---

## 7. Ordem em chat

1. ~~**`ok api etapa 0`** — validar este contrato~~ **feito**
2. ~~**`ok api etapa 1`** — tabela + flag off + gerar/listar/revogar~~ **feito**
3. ~~**`ok api etapa 2`** — cadastrar lead com a chave~~ **feito**
4. ~~**`ok api etapa 3`** — tela em Integrações~~ **feito**
5. ~~**`ok api etapa 4`** — flag global, log e limpeza~~ **feito**

---

## 8. Relação com o que já existe

| Peça | Relação |
|------|---------|
| `POST /api/leads` + `leadsController.createLead` | Único caminho que a API compartilha. Contrato JWT não muda |
| Kanban (`kanban_column`), chatbot (`chatbot_flow`), portal (`support_portal`) | Também inserem em `leads`. **Não** passam pelo serviço novo |
| `lead_statuses` | Lista válida de `status` da API, filtrada pelo `user_id` do dono da chave |
| `isTenantAdmin` | Quem pode gerar e revogar |
| `requireActivePlanPeriod` | Chave não fura tenant inadimplente |
| `featureFlagKeys.ts` | Novo namespace `api` |
| Credenciais Asaas/Stripe | Outra coisa: chave de gateway, não chave desta API |

---

## 9. Riscos

1. **Segredo em log ou no GET** — hash only; teste da Etapa 1 cobre a resposta de listagem.
2. **Dono removido** — `owner_user_id` com `ON DELETE CASCADE` (API0.11). A chave some com o usuário.
3. **Status livre quebra o funil** — validar contra `lead_statuses` do dono.
4. **Retry do integrador duplica lead** — `Idempotency-Key` na Etapa 2. Sem a header, o comportamento é o do painel (cada POST cria um lead).
5. **Desligar uma conta** — o padrão é ligado. Para esconder a API de um tenant, desligue `api.keys_v1` no override do Super Admin.

---

## 10. Próximas ações (depois deste MVP)

Na ordem sugerida, cada uma = novo escopo na mesma chave, sem trocar o modelo:

1. `GET /api/v1/leads/:id` e listagem
2. `PATCH` de lead
3. Cadastro de cliente
4. Webhook de saída quando o lead muda de status

---

*Documento de implantação. Etapas 0–4 concluídas (2026-10-27). A API está ligada por padrão para todos os tenants.*
