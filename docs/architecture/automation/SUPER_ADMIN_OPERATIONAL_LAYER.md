# Super Admin Operational Layer (Sprint 6.5)

Objetivo: transformar o Super Admin de painel técnico em **command center operacional** de aquisição/ativação/recovery, **reutilizando** o que já existe (Kanban, workflows, outbox, communication gateway).

## Onboarding wizard (Sprint 7 foundation)

Rota: `/onboarding/acquisition?session=`. Etapas: **Empresa** → **Equipe** → **WhatsApp** (após provision com senha).

| Evento | Kanban | Lead stage |
|--------|--------|------------|
| `onboarding.company.completed` | Onboarding incompleto | `onboarding_in_progress` |
| `onboarding.users.completed` | Trial iniciado (parcial) | `onboarding_active` |
| `whatsapp.connected` | Ativado | `converted` |

Sessão: `acquisition_onboarding_sessions` (`current_step`, `completed_steps`, `activation_progress`). API: `/api/onboarding/wizard/*` (auth) e `GET .../onboarding/wizard/:token` (pública).

## Princípio central

**Não criar um novo Kanban.** Reusar:

- UI de Kanban (boards, colunas, cards, drag/drop)
- Realtime
- Regras/automação por coluna (phase2)
- Integrações existentes (workflow runtime + orchestration + outbox + communication gateway)

## Arquitetura: Kanban operacional do Super Admin

### Isolamento (permission boundaries)

Tenant kanban ≠ super admin operational kanban.

Implementação: **tenant virtual fixo** exclusivo do Super Admin.

- Backend injeta `req.tenantId = SUPERADMIN_OPS_KANBAN_TENANT_ID`
- Rotas protegidas por `requireSuperAdmin`
- `setRequestDb` já ativa `app.bypass_rls = '1'` para superadmin, mas os dados continuam isolados pelo `tenant_id` do tenant virtual.

Benefícios:

- Reuso integral das tabelas `chat_kanban_*`
- Zero risco de “misturar” quadros de tenants reais
- Mantém o engine único

### API

Nova base:

- `GET /api/superadmin/ops/kanban/boards`
- `POST /api/superadmin/ops/kanban/boards`
- `GET /api/superadmin/ops/kanban/boards/:boardId/cards`
- etc. (mesmo contrato do `/api/chat/kanban`)

Handlers reutilizados do controller `chatKanbanController.ts`.

### Frontend

Rota:

- `/superadmin/operacao/kanbans`

Reuso:

- `ChatKanbanPage` como componente base
- `service` injetável para trocar o base path (`/api/superadmin/ops/kanban`)

## Visão operacional (pipelines)

Super Admin deve suportar múltiplos kanbans operacionais:

- Aquisição
- Recovery
- Onboarding
- SDR (future-ready)
- Expansão / Reativação

Cada board é configurável (colunas, regras, automações).

## Seed automático (primeiro acesso)

Ao abrir `/superadmin/operacao/kanbans` ou chamar `POST /api/superadmin/ops/kanban/bootstrap`:

- Cria **5 boards** se não existirem: Aquisição, Recovery, Onboarding, Expansão, Reativação
- Adiciona **colunas padrão** faltantes (idempotente — boards editáveis depois)
- **Backfill**: sincroniza leads recentes sem cartão para o board **Aquisição**

`GET /api/superadmin/ops/kanban/boards` também executa seed leve antes de listar.

## Operationalização de leads (implementado — Sprint 6.5+)

`acquisition_leads` alimenta o Kanban operacional via **outbox + passive consumers** (sem engine paralelo).
Fallback direto se `outbox.write_v1` estiver off.

Fluxo:

1. Lead criado/atualizado (`/cadastro`, `/teste-gratis`, recovery) → `publishDomainEventDetached`
2. Outbox publisher → consumers `ops.kanban.acquisition.*`
3. `syncAcquisitionLeadToOpsKanban` cria/move cartão no board **Aquisição** (tenant virtual)
4. Cartões usam `chat_kanban_cards.acquisition_lead_id` (migration `260`) — **sem conversa fake**

Eventos:

| Evento | Efeito no Kanban |
|--------|------------------|
| `acquisition.lead.created` | Coluna **Novo lead** |
| `acquisition.signup.started` | Coluna por `step` (contact/plan/checkout) |
| `acquisition.stage.changed` | Coluna por `current_stage` |
| `acquisition.checkout.abandoned` | **Checkout abandonado** + automação recovery |

Primeira automação operacional: ao entrar em **Checkout abandonado** (evento ou drag manual) → workflow shadow + `automation_job` + communication gateway (shadow) + timeline no metadata do card.

Direção (colunas):

- Kanban de aquisição com colunas como:
  - Novo lead
  - Qualificado
  - Iniciou cadastro
  - Checkout abandonado
  - Trial iniciado
  - Onboarding incompleto
  - Ativado
  - Perdido
- Cards enriquecidos com:
  - stage, owner, score, tags, origem/canal
  - last_contact_at, workflow status, activation status
  - timeline unificada (events + mensagens + automações)

**Importante:** sem criar novo engine de automação — gatilhos vêm do workflow/orchestration já existente.

## Lifecycle e automações (direção)

Exemplos de eventos que movem cards automaticamente:

- `signup_started` → move para “Iniciou cadastro”
- `checkout_started` → move para “Checkout”
- `checkout_abandoned` → move para “Recovery”
- `trial_started` → move para “Trial iniciado”
- `onboarding_incomplete` → move para “Onboarding incompleto”
- `activated` → move para “Ativado”

Implementação pretendida:

- Outbox + passive consumers → aciona `chatKanbanAutomationService`/pipeline existente
- Communication gateway para tentativas de recovery (WhatsApp) (future-ready)

## Riscos

- “Tenant virtual” é uma convenção: precisa estar bem documentada e restrita às rotas superadmin.
- Boards vazios inicialmente: criar templates/padrões (board Aquisição) melhora o time-to-value.

## Próximos passos recomendados

1. Seed de board “Aquisição” com colunas padrão no primeiro acesso
2. Adaptar cards para suportar “Lead card” (sem conversa) ou criar “conversa espelho” para lead
3. Timeline operacional unificada (events + messages + workflows)
4. Incluir Recovery/Activation dashboards no Super Admin (command center)

