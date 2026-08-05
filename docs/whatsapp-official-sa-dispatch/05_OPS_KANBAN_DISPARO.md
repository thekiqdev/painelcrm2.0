# 05 — Ops Kanban: disparo no kanban de registro

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** a preencher (investigação)  
**Depende de:** [01](./01_ESCOPO_PRODUTO_E_CANAIS.md) (**D1:** auto + manual), [02](./02_CONTA_META_E_REMETENTE.md), [03](./03_BRIDGE_MOTOR_META.md), [04B](./04B_CICLO_VIDA_MODELOS.md), [08](./08_COMPLIANCE_META.md) (opt-in marketing)  
**Bloqueia:** UI de disparo no card / automações Meta

---

## 1. Objetivo

Mapear o Kanban de registro (Ops) ponta a ponta e definir **como** o disparo oficial Meta se encaixa.

**D1 / D5:** v1 inclui **automações por coluna** e **envio manual no card** (`ChatKanbanOpsLeadDialog`). Automações oficiais exigem HSM APPROVED vinculado — [04B](./04B_CICLO_VIDA_MODELOS.md).

---

## 2. Achados baseline

### 2.1 Superfície

| Peça | Path |
|------|------|
| Rota | `/superadmin/operacao/kanbans` |
| Página | `src/pages/superadmin/SuperAdminOpsKanbanPage.tsx` (render `ChatKanbanPage`) |
| Service FE | `src/services/superadminOpsKanban.ts` → `/api/superadmin/ops/kanban` |
| Dialog lead | `ChatKanbanOpsLeadDialog` — email, WhatsApp, stage, timeline; **sem botão enviar** |
| Settings coluna | `ChatKanbanColumnSettingsSheet` — `auto_message_mode` / modelos WhatsApp |

### 2.2 Backend

| Peça | Path |
|------|------|
| Rotas | `packages/backend/src/routes/superadminOpsKanbanRoutes.ts` |
| Tenant virtual | `config/superadminOpsKanban.ts` (`1f1a0f0a-0000-4000-8000-000000000001`) |
| Migração | `database/init/259_superadmin_ops_tenant_p0.sql` |
| Seed boards | `superadminOpsKanbanSeedService.ts` |
| Sync lead→card | `superadminOpsKanbanLeadService.ts` (`syncAcquisitionLeadToOpsKanban`) |
| Outbox | `outbox/passiveConsumers/opsKanbanAcquisitionHandlers.ts` |
| Moves / Phase2 | `moveOpsCardWithAutomations.ts`, `kanbanLeadPhase2AutomationService.ts` |
| Checkout abandonado | `superadminOpsColumnAutomationService.ts` |
| Send | `opsLeadGatewaySend.ts` → `sendMessage` (gateway) → hoje UazAPI |

### 2.3 Boards canônicos (seed)

1. Aquisição  
2. Recovery  
3. Onboarding  
4. Expansão  
5. Reativação  
6. Engajamento Trial  

Stage→coluna (Aquisição) em `STAGE_TO_COLUMN` dentro de `superadminOpsKanbanLeadService.ts`.

### 2.4 Messaging já existente

- Automação checkout abandonado / Phase2 → WhatsApp recovery via gateway.
- Flag `communication.gateway_v1` pode shadow/skip envio real.
- **Não há** UI de disparo manual no card do Ops Kanban.
- Campanhas Meta e Anúncios são superfícies **separadas** (ver 06).

---

## 3. Fluxo E2E atual

```
AcquisitionSignup / acquisition_* 
  → acquisition_leads + outbox events
  → opsKanbanAcquisitionHandlers
  → card no board Aquisição (coluna por stage)
  → (opcional) enter column → Phase2 / checkout automation
  → buildOpsLeadGatewaySendInput + sendMessage
  → provider uazapi (instance plataforma)
  → timeline no metadata do card
```

---

## 4. Perguntas a responder

1. v1 = só trocar provider das automações existentes para Meta, ou também **novo** envio manual no dialog?
2. Quais colunas/boards devem disparar automaticamente na v1? (matriz abaixo)
3. Conteúdo: HSM Meta **vinculado** por coluna (Fase Modelos), template motor texto, ou modelo já configurado na coluna (`auto_message_mode`)?
4. Reusar `WhatsappOfficialCampaignsPage` para disparos em massa a partir de filtros do kanban?
5. Telefone: campo WhatsApp do lead — normalização BR (`brazilWhatsappPhone`) e qualidade dos dados?
6. Opt-in: leads de aquisição têm consentimento para marketing? (ver 08)
7. Deduplicação: lead recebe automação coluna + anúncio + campanha Meta — política?
8. Timeline: como registrar `wamid` / status entrega no card?

---

## 5. Matriz coluna → mensagem (preencher)

### Board Aquisição

| Coluna | Auto-envio hoje? | Incluir Meta v1? | Template / HSM | Trigger |
|--------|------------------|------------------|----------------|---------|
| Novo lead | | ☐ | | |
| Qualificado | | ☐ | | |
| Iniciou cadastro | | ☐ | | |
| Checkout | | ☐ | | |
| Checkout abandonado | sim (investigar) | ☐ | | enter / event |
| Trial iniciado | | ☐ | | |
| Onboarding incompleto | | ☐ | | |
| Ativado | | ☐ | | |
| Perdido | | ☐ | | |

Repetir tabelas para Recovery / Onboarding / Expansão / Reativação / Engajamento Trial conforme escopo.

---

## 6. Opções de produto para “disparo no kanban”

| Opção | Descrição | Esforço | Compliance |
|-------|-----------|---------|------------|
| A | Só migrar automações backend para Meta | Menor | Depende se UTILITY vs MARKETING |
| B | A + botão “Enviar WhatsApp” no `ChatKanbanOpsLeadDialog` (template picker) | Médio | Sessão 24h ou HSM |
| C | A + B + disparo em lote da coluna (seleção múltipla) | Maior | Preferir campanhas Meta existentes |
| D | Integração “criar campanha Meta a partir do board/filtro” | Maior | Já alinhado a HSM |

Recomendação de investigação: preferir **A+B** na v1; lote via campanhas (D) em vez de reinventar queue.

---

## 7. Checklist de leitura

- [ ] `opsLeadGatewaySend.ts`
- [ ] `superadminOpsColumnAutomationService.ts`
- [ ] `kanbanLeadPhase2AutomationService.ts`
- [ ] `ChatKanbanOpsLeadDialog` (+ timeline service)
- [ ] `ChatKanbanColumnSettingsSheet` / `kanbanPhase2` utils
- [ ] `superadminOpsKanbanLeadService.ts` (`STAGE_TO_COLUMN`)
- [ ] Seed boards / metadata de colunas em DB (amostra staging)
- [ ] Flag gateway + overrides do tenant Ops

---

## 8. Decisão (preencher)

| Campo | Valor |
|-------|-------|
| Opção produto | **B** (auto + manual) — D1 |
| Colunas v1 | *em aberto* |
| Provider | Meta only (sem fallback UazAPI — D1) |
| Lote | campanhas / anúncios no plano (04C) |
| Data | 2026-08-03 (modo); colunas TBD |

**Próximo:** [06_SUPERFICIES_SUPER_ADMIN.md](./06_SUPERFICIES_SUPER_ADMIN.md) · anúncios [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)
