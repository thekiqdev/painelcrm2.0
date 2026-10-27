# API Etapa 0 — Inventário e decisões (chave + cadastro de lead) — **FEITO**

| Campo | Valor |
|-------|-------|
| **Data** | 2026-10-27 |
| **Etapa** | **0** (**feito**) |
| **Plano-mãe** | [`PLAN_IMPLANTACAO_API_CHAVES_LEAD.md`](./PLAN_IMPLANTACAO_API_CHAVES_LEAD.md) |
| **Código desta etapa** | Nenhum. Flag, tabela e rotas começam na Etapa 1 |
| **Próximo** | Etapa 1 **feita** → [`SPRINT_API_E1_API_KEYS.md`](./SPRINT_API_E1_API_KEYS.md) · seguinte: `ok api etapa 2` |

---

## Objetivo

Fechar o contrato do MVP, o dono do lead, o nome da flag e o lugar da UI, e inventariar as escritas de lead que já existem — antes de gerar chave.

---

## Decisões fechadas (Etapa 0)

| ID | Tema | Fechado |
|----|------|---------|
| **API0.1** | Superfície | Gestão em `/api/integrations/api-keys` (sessão JWT). Uso em `POST /api/v1/leads` (chave). `POST /api/leads` não muda |
| **API0.2** | Escopo do MVP | Só `leads.create`. Coluna `scopes` já nasce para o resto |
| **API0.3** | Dono do lead | `owner_user_id` = admin que gerou a chave. O body **não** aceita `user_id`, `profile_id` nem `tenant_id` |
| **API0.4** | Quem gera e revoga | Só `isTenantAdmin`. A UI da Etapa 3 esconde a secção para quem não é admin |
| **API0.5** | `source` | Se o JSON omitir, gravar **`API`**. O painel continua com default `Outros` |
| **API0.6** | `status` | Se vier, tem de ser um `name` de `lead_statuses` **do dono da chave** (`user_id`). Se omitido, `null` |
| **API0.7** | Flag | Nome `api.keys_v1`, namespace `api`. Nasceu off na Etapa 1. **Etapa 4:** `default_enabled=true` e `rollout_type=global` para todos os tenants. Sem `api.master_off`. Override de um tenant ainda desliga só aquela conta |
| **API0.8** | Escritas atuais | Quatro `INSERT` em `leads`. A API compartilha serviço **só** com `createLead`. Kanban, chatbot e portal de suporte ficam nos seus inserts |
| **API0.9** | Plano do tenant | `POST /api/v1/leads` reaplica `requireTenantCommercialAccess` + `requireActivePlanPeriod` (402 `PLAN_EXPIRED`). Não usa a cadeia `tenantAuthCrm` |
| **API0.10** | Segredo | `pcrm_` + 32 bytes base64url. Banco: SHA-256 + prefixo de 12 caracteres. Plaintext só na resposta do POST de criação |
| **API0.11** | Usuário removido | `owner_user_id` com `ON DELETE CASCADE` — a chave some com o usuário |
| **API0.12** | UI | Configurações → Integrações, path `/settings/api` (`pathSegment: api`). A rota `settings/:sectionSlug` já existe |
| **API0.13** | Autorização da chamada | O escopo da chave autoriza o POST. Não reavaliar `leads.create` do usuário a cada request. Corte = revogar |
| **API0.14** | Idempotência e limite | `Idempotency-Key` e 60 req/min **por chave** na Etapa 2, além do limiter global de `/api/` |
| **API0.15** | Env | `API_KEYS_V1` só se a linha não existir em `platform_feature_flags` (mesmo padrão Partner). Ausente → **off** |

---

## Inventário — o que já existe

### Flag

| Item | Estado |
|------|--------|
| `api.keys_v1` | **Não existe** em `featureFlagKeys.ts` nem em `platform_feature_flags` |
| Namespace `api` | **Não existe** em `PLATFORM_FLAG_NAMESPACES` |
| Flag desconhecida | `featureFlagRegistry` devolve `enabled: false`, `reason: unknown_flag` |

Criar os dois na Etapa 1, default off. Enquanto a linha não existir, o comportamento já é desligado.

### Cadastro de lead pelo painel (caminho que a API vai reutilizar)

| Peça | Onde |
|------|------|
| Rota | `POST /api/leads` em `packages/backend/src/routes/leadsRoutes.ts` |
| Auth | `tenantAuthCrm`: JWT, tenant, `requireTenantCommercialAccess`, `requireActivePlanPeriod`, RLS |
| Permissão da rota | `requirePermission('leads.create')` |
| Handler | `leadsController.createLead` — chama de novo `assertModulePermission` + `assertPermissionKey('leads.create')` |
| Schema | `name` obrigatório; `email`, `phone`, `company`, `source`, `status`, `notes`, `profile_id`, `cpf_cnpj` opcionais |
| Default de `source` no painel | `Outros` |
| `status` no painel | Texto livre (não valida contra `lead_statuses`) |
| `cpf_cnpj` | 11 ou 14 dígitos (`328_leads_cpf_cnpj.sql`) |
| Insert | `user_id` = usuário da sessão |

A API **não** copia o `status` livre nem o `profile_id`. Isso fica explícito no serviço novo (Etapa 2): o painel pode continuar aceitando status livre; o `POST /api/v1/leads` valida o nome em `lead_statuses` do dono.

### Outras escritas em `public.leads` (não entram nesta API)

| Origem | Source gravado | Nota |
|--------|----------------|------|
| `kanbanColumnAutomationService.ts` | `kanban_column` | Cria lead a partir do cartão e vincula a conversa |
| `chatbotFlows/flowCrmConvertActions.ts` | `chatbot_flow` | `crm_convert` para lead |
| `supportPortalPhoneMatch.ts` (`insertSupportPortalLead`) | `support_portal` | Ticket público sem lead |

`superadmin_leads` e `acquisition_leads` são outras tabelas. Fora do MVP.

### Quem é admin do tenant

`isTenantAdmin` em `packages/backend/src/utils/tenant.ts`: `user_roles.role = 'admin'` no perfil do mesmo `tenant_id`. O front já expõe `user.is_tenant_admin` (ex.: `GoogleDriveSection`).

A tela de Configurações em si não é exclusiva de admin. A secção API (Etapa 3) e as rotas de gestão (Etapa 1) sim.

### Onde a UI encaixa

| Peça | Estado |
|------|--------|
| Menu | `src/config/settingsNavigation.ts` — categoria **Integrações** (Google Agenda, Drive, pagamentos) |
| Rota | `src/App.tsx`: `/settings/:sectionSlug` → `SettingsSectionPage` |
| Slug reservado | `payments`, `integrations`, `payment`. **`api` está livre** |
| i18n | `src/locales/pt-BR/settings.json` — categoria `cat_integrations` já existe. Textos da secção entram na Etapa 3 |

### Limite e log (constraint da Etapa 2)

| Peça | Estado |
|------|--------|
| Limiter global | `app.use('/api/', limiter)` — 2000 req / 15 min **por IP** (`RATE_LIMIT_MAX`). `/api/v1` cai nele |
| Limite por chave | **Não existe.** Etapa 2 adiciona 60/min por chave, sem tirar o global |
| Access log | `LOG_HTTP=1` grava método + URL, não o body. O middleware da chave não pode logar `Authorization` nem `X-Api-Key` |

### Plano expirado

`requireActivePlanPeriod` (`middleware/auth.ts`): `tenants.plan_period_end < now()` → **402** `PLAN_EXPIRED`. Sem `plan_period_end`, deixa passar. A Etapa 2 chama essa função depois de resolver o tenant pela chave (não há `req.tenantId` de JWT).

---

## Gaps → próximas etapas

| Gap | Etapa |
|-----|--------|
| Tabela `api_keys`, flag `api.keys_v1`, POST/GET/DELETE da gestão | **1** |
| `leadCreateService` + `POST /api/v1/leads` + idempotência + limite por chave | **2** |
| Secção `/settings/api` | **3** |
| Log de uso sem segredo, limpeza de idempotência, flag no piloto | **4** |

---

## DoD Etapa 0

- [x] Decisões API0.1–API0.15 fechadas
- [x] Contrato do JSON do plano-mãe aceito (`name` obrigatório, source default `API`, sem ids internos)
- [x] Flag nomeada; ainda não criada no código (Etapa 1, default off)
- [x] Gestão só para `isTenantAdmin`
- [x] UI prevista em `/settings/api`
- [x] Inventário do `POST /api/leads` e das outras três escritas
- [x] Plano-mãe atualizado

---

## Kickoff próximo

`ok api etapa 1` — migration `355_api_keys.sql`, flag `api.keys_v1` off, gerar / listar / revogar chave.
