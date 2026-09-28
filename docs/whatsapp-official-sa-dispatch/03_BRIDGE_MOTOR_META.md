# 03 — Bridge: motor de notificações ↔ Meta Cloud

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** **D3 FECHADO** — Opção **C (híbrido)**  
**Depende de:** [01](./01_ESCOPO_PRODUTO_E_CANAIS.md), [02](./02_CONTA_META_E_REMETENTE.md), [04B](./04B_CICLO_VIDA_MODELOS.md)  
**Bloqueia:** implementação sprints S1+ · [07](./07_GATEWAY_ROUTING.md)

---

## 1. Objetivo

Escolher **como** as notificações transacionais, anúncios e Ops passam a enviar pela Graph API, sem perder idempotência, retries e histórico.

**Pré-condição:** só `sendTemplateMessage` com HSM **vinculado e APPROVED** (D1/04B). Sem texto livre na Graph nos fluxos oficiais. Sem fallback UazAPI (D1/D2).

---

## 2. Fluxo atual (UazAPI)

```
Evento → publish* → gates → orchestrator → delivery → dispatch* → uazapi
```

| Consumidor | Path hoje |
|------------|-----------|
| Platform notifications | `dispatchPlatformWhatsAppText` |
| Anúncios | `announcementSendWorker` → mesmo dispatch |
| Ops Kanban | `sendMessage` gateway → uazapi |
| Campanhas Meta | worker oficial próprio (já Graph) |

---

## 3. Opções (resumo)

| Opção | Ideia | Por que não sozinha |
|-------|--------|---------------------|
| A — só gateway | Adapter `meta_cloud` | Motors/anúncios **não** usam gateway hoje → refactor grande |
| B — só dispatcher | Branch Meta no dispatcher | Ops fica de fora ou bypass feio; duplica vs campanhas |
| **C — híbrido** | Sender resolve + client Graph partilhado; dispatcher **e** gateway Meta | Cobre D1 completo sem forçar um único entrypoint já |

---

## 4. Decisão D3 — Opção C (híbrido)

### 4.1 Camadas

```
┌─────────────────────────────────────────────────────────┐
│  platformWhatsAppSenderResolve (D2)                     │
│  → meta_cloud account ready | uazapi legacy | not_ready │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌───────────────┐ ┌─────────────┐ ┌──────────────────┐
│ OfficialSend  │ │ Dispatcher  │ │ Gateway adapter  │
│ (shared)      │ │ branch Meta │ │ meta_cloud       │
│ sendTemplate  │ │ motors +    │ │ Ops Kanban       │
│ + wamid       │ │ anúncios    │ │ (+ futuro)       │
└───────┬───────┘ └──────┬──────┘ └────────┬─────────┘
        │                │                 │
        └────────────────┴─────────────────┘
                         ▼
              whatsappOfficialClient (Graph)
```

Campanhas Meta **continuam** no worker atual; idealmente passam a chamar o mesmo `OfficialSend` depois (não bloqueia S0–S2).

### 4.2 Regras de runtime

1. Fluxo `channel=meta_cloud` / oficial requerido → resolve Meta; se não ready → **fail explícito** (não UazAPI).
2. Envio oficial → **sempre** template APPROVED + vínculo (ou template do anúncio APPROVED).
3. Retry workers: chamar o mesmo `dispatch*` / `OfficialSend` (branch por provider no resultado).
4. PIX follow-up: v1 = botão URL no HSM de `charge.created` (ou segundo HSM); **não** `sendPixButton` UazAPI no path oficial.
5. Password reset / change logado: entram no path oficial via motor/dispatch Meta (HSM AUTH/UTILITY).
6. Persistência v1: `wamid` + provider em `platform_notification_deliveries` (e anúncio recipients); chat oficial opcional P1.

### 4.3 Por que C

- D1 exige motors **e** Ops **e** anúncios oficiais.
- Motors já têm orchestrator + retry + idempotency — branch no dispatcher é o menor risco.
- Ops já está no gateway — precisa adapter Meta real ([07](./07_GATEWAY_ROUTING.md)).
- Um `OfficialSend` + resolve evita três clientes Graph divergentes.

---

## 5. Respostas fechadas

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Path v1 | **C** |
| 2 | Texto livre Graph? | **Não** nos oficiais; só HSM |
| 3 | Persistência | Deliveries + wamid; chat oficial depois |
| 4 | Retry | Mesmo dispatch/OfficialSend |
| 5 | PIX | HSM/CTA URL no path oficial |
| 6 | Password logado | Bridge oficial (mesmo sender) |

---

## 6. Checklist implementação (sprints)

- [ ] `platformWhatsAppSenderResolve`
- [ ] `officialWhatsAppSend` (template + map errors → retryable)
- [ ] Branch Meta em `whatsappChannelDispatcher` / platform dispatch
- [ ] Adapter `meta_cloud` no gateway (deixar de ser stub)
- [ ] Ops: `buildOpsLeadGatewaySendInput` sem exigir instanceToken UazAPI no path oficial
- [ ] Anúncios worker branch Meta
- [ ] Classificador erros Graph
- [ ] Testes unitários mocks Graph

---

## 7. Decisão

| Campo | Valor |
|-------|-------|
| Opção | **C (híbrido)** |
| Motivo | Cobrir motors + anúncios + Ops sem migrar tudo ao gateway de uma vez |
| Escopo bridge v1 | Platform notifications + anúncios oficiais + Ops Kanban |
| PIX na v1 Meta | Via HSM/CTA, não UazAPI no path oficial |
| Data | **2026-08-03** |

**ADR:** [11](./11_ADR_DECISOES.md) § D3  

**Próximo:** [07](./07_GATEWAY_ROUTING.md) · [PLAN_SPRINTS_S0_S4.md](./PLAN_SPRINTS_S0_S4.md)
