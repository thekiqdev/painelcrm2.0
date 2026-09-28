# PLAN_RUNTIME_OWNERSHIP_CLOSURE — Phases 10F → 11

| Campo | Valor |
|---|---|
| **Documento** | Plano incremental de unificação de ownership |
| **Data** | 2026-07-15 |
| **Base** | Audit Phase 10C · Review arquitetural · Phase 10D CLOSED |
| **Tipo** | Planejamento — implementação por sprint sob comando |
| **Backend / SQL / Redis / Socket Protocol / Workers / Flags catalog / ADR** | **NÃO ALTERAR** (salvo sprint que explicitar o contrário) |

---

## Princípio

Estender o **Domain Store** já existente. Não criar “Runtime Core” paralelo.  
Uma violação de ownership por sprint. Kanban e Store OFF fora do caminho crítico até decisão/canário.

---

## Destino arquitetural

```
Instance (um reader path para inbox)
        │
        ▼
Conversation Store (lista + header + CRM fields)
        │
        ▼
Message Store (thread)
        │
        ▼
Preview ← Messages (já Phase 10D, hydrated)
        │
        ▼
Selectors
        │
 ┌──────┴────────┐
 ▼               ▼
Chat          Floating

Kanban  →  projeção explícita OU fase própria (decisão)
Store OFF → aposentadoria pós-canário (Phase 11)
```

---

## Protocolo de execução

| Comando do usuário | Ação do agente |
|---|---|
| `ok sprint 1` | Inicia **Sprint 1** (implementação + docs da sprint) |
| `ok sprint 2` | Inicia **Sprint 2** | 
| `ok sprint N` | Inicia **Sprint N** |
| (fim automático ao fechar a sprint) | Gera doc de **fecho** do que foi feito |

### Regra de observação

Ao final de cada sprint, o agente gera um documento de closeout.

- Se durante a sprint **observar** problemas fora do escopo: **não corrigir**.  
- Apenas **registrar** na seção `Observações (não corrigidas)` do closeout.  
- Correção só entra quando o usuário autorizar a sprint correspondente (ou sprint de follow-up).

### Artefatos por sprint

| Momento | Arquivo |
|---|---|
| Plano (este) | `PLAN_RUNTIME_OWNERSHIP_CLOSURE.md` |
| Spec da sprint (ao iniciar) | `SPRINT_N_<SLUG>.md` (se ainda não existir detalhe) |
| Fecho (obrigatório) | `SPRINT_N_CLOSEOUT.md` |

---

## Já concluído (pré-plano)

| Phase | Resultado |
|---|---|
| 9 | Zero polling Chat |
| 10A | CRM → Domain Store |
| 10B | Conversation lista Chat/Float → Store |
| 10C | Auditoria ownership |
| 10D | Preview ← Messages (hydrated) |

---

## Ordem das sprints (invertida vs. plano anterior)

> **Sprint 1 = Phase 10F** (Instance primeiro).  
> Em seguida Header Float, polish, CRM detail, gate Kanban, Phase 11.

| Sprint | Phase | Título | Prioridade | Estimativa |
|---|---|---|---|---|
| **1** | **10F** | Instance Visibility Unification | P0 | 0,5–1 |
| **2** | **10E** | Float Header / Meta Ownership | P0 | 0,5–1 |
| **3** | **10G** | Selection & Open Pipeline Hardening | P1 | ~0,5 |
| **4** | **10H** | CRM Detail Ownership | P1 | 0,5–1 |
| **5** | **10K-GATE** | Decisão Kanban (A residual / B unificar) | Gate | decisão |
| **6** | **11** | Legacy Retirement (Store OFF + doc SoT) | P1 pós-canário | 1–2 |

```
Sprint 1 (10F Instance)
    → Sprint 2 (10E Header Float)
    → Sprint 3 (10G Open/race)
    → Sprint 4 (10H CRM detail)
    → Sprint 5 (Kanban gate)
    → Canário Store ON
    → Sprint 6 (Phase 11 Legacy retirement)
```

---

## Sprint 1 — Phase 10F · Instance Visibility Unification

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — ver `SPRINT_1_CLOSEOUT.md` |
| **Prioridade** | P0 |

### Problema

Chat (`enabledInstanceIds`) e Floating (`instanceIds`) usam listas/cópia locais distintas → `loadInboxCommand` pode receber filtros diferentes → conversas “somem” no Float ou divergem do Chat.

### Objetivo

Um único reader path de instances para **filtro de inbox** em Chat e Float.

### Escopo

- Fonte única (Registry ON ou HTTP cache + helper compartilhado)
- Mesmo critério **`enabled`** para inbox (`loadInboxCommand`)
- Critério **`connected`** permanece só no canal picker / composer (não na visibility da lista)
- Sem alterar Backend / Flags catalog

### Fora de escopo

- Header Float meta RQ (Sprint 2)
- Kanban, Store OFF, Preview (já 10D)

### Critério de aceite

Mesmos instance IDs efetivos de inbox → mesma visibility de Conversation em Chat e Float (Store ON).

### Closeout esperado

`SPRINT_1_CLOSEOUT.md` (Phase 10F) + seção Observações.

---

## Sprint 2 — Phase 10E · Float Header / Meta Ownership

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — ver `SPRINT_2_CLOSEOUT.md` |
| **Prioridade** | P0 |
| **Depende de** | Sprint 1 recomendada (Instance estável) |

### Problema

Floating header ainda lê RQ `conversation-meta` (HTTP → UI sem passar pela Conversation Store).

### Objetivo

Header / meta da row Floating = Domain Store (mesmos campos que o Chat).

### Escopo

- Window / CompactProfile / Mobile overlay leem Store por `conversationId`
- Remover ou rebaixar `conversation-meta` do path crítico
- GET de profile detalhado pode permanecer ephemeral (não SoT)

### Critério de aceite

Float header ≡ Chat header para campos da Conversation Store.

### Closeout esperado

`SPRINT_2_CLOSEOUT.md` (Phase 10E).

---

## Sprint 3 — Phase 10G · Selection & Open Pipeline Hardening

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — ver `SPRINT_3_CLOSEOUT.md` |
| **Prioridade** | P1 |
| **Depende de** | Sprint 1–2 |

### Problema

Races de open (generation, reopen Float/Chat, scroll) ainda podem deixar UI inconsistente mesmo com Preview↔Messages alinhados.

### Objetivo

Ordem determinística:

```
select → loadMessages → Preview sync → selectors → UI
```

Selection **permanece** UI local (`useState` / panels) — não precisa ir para Domain Store.

### Critério de aceite

Abrir / trocar / reabrir conversa sem Preview≠Thread por race documentada; métricas de generation estáveis.

### Closeout esperado

`SPRINT_3_CLOSEOUT.md` (Phase 10G).

---

## Sprint 4 — Phase 10H · CRM Detail Ownership

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — ver `SPRINT_4_CLOSEOUT.md` |
| **Prioridade** | P1 |
| **Depende de** | Sprint 2 (header Store) |

### Problema

`currentLead` / `currentClient` locais podem divergir da Conversation Store após mutações (10A mitigou Chat; residual Float/Chat detail).

### Objetivo

SoT de vínculo = Conversation (`leadId` / `clientId` na Store). Detail GET = **cache de projeção** explícito, sem apagar SoT.

### Critério de aceite

Link/unlink/convert atualiza Store e UI Chat+Float sem effect stale limpando CRM.

### Closeout esperado

`SPRINT_4_CLOSEOUT.md` (Phase 10H).

---

## Sprint 5 — Kanban Gate (Phase 10K-GATE)

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — decisão **Opção A** (`SPRINT_5_CLOSEOUT.md`) |
| **Tipo** | Decisão arquitetural (+ doc); implementação só se opção B |

### Opções

| Opção | Descrição |
|---|---|
| **A — Residual oficial** | Board `conv_*` / `listCards` = projeção de produto; **não** entra no SoT Chat/Float |
| **B — Unificar** | Abrir sprint de implementação Kanban → Conversation Store (ADR próprio) |

### Recomendação do plano

**Opção A** até Chat/Float estáveis em canário. Kanban não cura Preview/Thread/Instance/Header.

### Closeout esperado

`SPRINT_5_CLOSEOUT.md` — registra decisão A ou B (+ se B, link do sprint de implementação).

---

## Sprint 6 — Phase 11 · Legacy Retirement

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — declaração + prep (purge físico → MB-028) |
| **Prioridade** | P1 |
| **Pré-requisito** | Sprints 1–5 fechadas · canário Store ON preferido (usuário avançou sob confirmação) |
| **Closeout** | [`SPRINT_6_CLOSEOUT.md`](./SPRINT_6_CLOSEOUT.md) |

### Objetivo

Declarar Domain Store como Runtime Core; inventariar dual-path Store OFF para MB-028 — **sem** delete físico nem flip de flags neste sprint.

### Escopo entregue

1. ADR-013 Domain Store = Runtime Core
2. `PHASE11_LEGACY_RETIREMENT.md` checklist MB-028
3. `cachePrecedence` Phase 11 helpers
4. Tracker / Architecture Status atualizados

### Não fazer (mantido)

Inventar Runtime Core paralelo; remoção física sem canário (ADR-010).

---

## Restrições globais (todas as sprints 1–5)

- Frontend only (salvo Sprint 6 se flags/documentação exigirem processo explícito)
- Sem alteração de: Backend, SQL, Redis, Socket protocol, Workers, Feature Flags catalog, ADR-010, ADR-011, contratos públicos Domain tipados
- Observações fora de escopo → closeout apenas

---

## Checklist rápido “como usar”

1. Ler este plano.  
2. Digitar **`ok sprint 1`** para começar Instance Visibility (10F).  
3. Ao concluir a sprint, o agente entrega `SPRINT_1_CLOSEOUT.md`.  
4. Revisar Observações.  
5. Digitar **`ok sprint 2`**, e assim por diante.

---

## Índice de closeouts (preenchido conforme execução)

| Sprint | Closeout | Status |
|---|---|---|
| 1 · 10F Instance | `SPRINT_1_CLOSEOUT.md` | **CLOSED** |
| 2 · 10E Header | `SPRINT_2_CLOSEOUT.md` | **CLOSED** |
| 3 · 10G Open | `SPRINT_3_CLOSEOUT.md` | **CLOSED** |
| 4 · 10H CRM | `SPRINT_4_CLOSEOUT.md` | **CLOSED** |
| 5 · Kanban Gate | `SPRINT_5_CLOSEOUT.md` | **CLOSED (Opção A)** |
| 6 · Phase 11 | `SPRINT_6_CLOSEOUT.md` | **CLOSED** (prep; MB-028 purge deferred) |

---

## Assinatura do plano

| | |
|---|---|
| Plano | **CLOSED** (Ownership Closure sprints 1–6) |
| Ordem | **10F → 10E → 10G → 10H → Kanban gate → Phase 11** |
| Kanban | **Residual oficial (A)** — sem unificação neste ciclo |
| Runtime Core | **ADR-013** Domain Store (`CHAT_CORE_STORE=ON`) |
| Próximo (fora plano) | Canário Store ON → **MB-028** remoção física dual-path |
| Follow-up UI/thread | [`PLAN_CHAT_THREAD_SURFACE_FIXES.md`](./PLAN_CHAT_THREAD_SURFACE_FIXES.md) (Float/lista/Chat parity) |
