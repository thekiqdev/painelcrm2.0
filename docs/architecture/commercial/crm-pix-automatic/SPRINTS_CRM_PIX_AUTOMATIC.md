# Sprints — Pix Automático CRM (faturas / assinaturas de clientes)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Base** | [`AUDIT_CRM_PIX_AUTOMATIC_PIPELINE.md`](./AUDIT_CRM_PIX_AUTOMATIC_PIPELINE.md) · [`DECISIONS_CRM_PIX_AUTOMATIC.md`](./DECISIONS_CRM_PIX_AUTOMATIC.md) · [`CRM0_SPIKE.md`](./CRM0_SPIKE.md) · [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) |
| **Constraint** | Sem mudança de arquitetura; reuso de padrões SaaS (S10/A/B/C + **fix1 liquidação 1º pagamento**) no path CRM |
| **Flag default** | OFF até piloto |

---

## Reavaliação de prontidão (2026-07-29)

| Pergunta | Resposta |
|----------|----------|
| Aptos a **iniciar implementação (CRM1)**? | **Sim** — flag OFF; sem impacto em produção |
| Aptos a **piloto com pagamento real**? | **Não** até CRM5 (G10) + G1/G2 webhooks tenant |
| Precisa de **mais investigação** antes de CRM1? | **Não** — spike + lição SaaS cobrem o desenho; falta só implementar + smoke Asaas tenant |

Ordem prática: **CRM1 agora** → CRM2∥CRM3 → CRM4 → **CRM5 (crítico G10)** → CRM6. Flag e recreate webhook (resto CRM0) em paralelo cedo.

---

## Visão da entrega

```text
CRM0  Spike / elegibilidade Asaas tenant + flag
CRM1  Persistência SSOT (subscriptions customer) + store/adapters
CRM2  Criação fatura/assinatura: toggle + start auth + metadata
CRM3  /pay/:token — switch default ON, opt-out, restore PIX avulso
CRM4  Renovação worker: instrução se auth active + janela
CRM5  Webhooks CRM + paid cleanup do ciclo
CRM6  Hardening, ops, QA smoke, closeout
```

Dependências: CRM0 → CRM1 → CRM2∥CRM3 → CRM4 → CRM5 → CRM6 (CRM2 e CRM3 podem paralelizar após CRM1).

---

## CRM0 — Spike e gating

**Objetivo:** confirmar elegibilidade Pix Automático em conta Asaas **tenant** e definir flag.

| Entrega | Critério |
|---------|----------|
| Investigação código + Asaas (webhooks multi-tenant, avulsa, janela 2–10, valor fixo, boleto) | [`CRM0_SPIKE.md`](./CRM0_SPIKE.md) — **feito** |
| Lição 1º pagamento órfão no plano | [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) — **feito** |
| Checklist ops + recreate webhook (G1/G2) | Eventos no provisionamento ✅; recreate tenants = ops pós-deploy |
| Flag plataforma `crm.pix_automatic` default OFF | ✅ migração `303` + helpers |
| Gate `canOfferCrmPixAutomatic` (flag + Asaas capability) | ✅ testes unitários; UI/API no CRM2 |

**Não faz:** cobrança real em produção; toggle UI (CRM2).

**Closeout:** [`CRM0_CLOSEOUT.md`](./CRM0_CLOSEOUT.md)

**Exit:** **GO CRM1**. **NO-GO piloto** até CRM5 + recreate webhook.

---

## CRM1 — Persistência e serviço (reuso, sem arquitetura nova)

**Objetivo:** SSOT auth em `subscriptions` `type=customer` + funções espelhando SaaS.

| Entrega | Critério |
|---------|----------|
| Uso das colunas `pix_automatic_*` também para `customer` (ajuste migration/índice se necessário) | ✅ `304` |
| Store get/upsert/status/opt-out (`cleared`) por `subscription_id` / `tenant_id`+client | ✅ |
| Persistência de `pix_automatic_conciliation_id` na subscription **e** na metadata da fatura no start auth | ✅ |
| Serviço: start auth para **customer_invoice** id (chama `asaasClient.createPixAutomaticAuthorization` já existente; `expirationSeconds`/`originalValue`) | ✅ |
| Normalização QR `data:image/png;base64,...` | ✅ |
| Stash `standalone_pix_*` + restore no cancel | ✅ |

**Não faz:** UI criação nem `/pay` ainda (stubs de API ok).

**Closeout:** [`CRM1_CLOSEOUT.md`](./CRM1_CLOSEOUT.md)

**Exit:** serviço testável; zero mudança no fluxo CRM com flag OFF. **GO CRM2/CRM3.**

---

## CRM2 — Criação / envio no painel

**Objetivo:** operador liga Pix Auto na criação da fatura ou da assinatura CRM.

| Entrega | Critério |
|---------|----------|
| Toggle em `CustomerInvoiceNew` (manual + recorrente) | ✅ gate CRM0 |
| Body API: `pix_automatic: true` (ou equivalente) | ✅ |
| `createManualInvoice` / `createRecurringManualInvoice`: se ON → ensure subscription link (D2) + start auth; metadata `pix_automatic_requested` + QR composto | ✅ degradação |
| Detalhe da fatura mostra status auth (pending/active/…) | ✅ badge |
| Fase 1.1 opcional no mesmo sprint se couber: proposta | **Backlog** |

**Closeout:** [`CRM2_CLOSEOUT.md`](./CRM2_CLOSEOUT.md)

**Exit:** criar fatura com toggle ON (flag ON + Asaas) gera auth `pending` + QR na metadata (staging). **GO CRM3.**

---

## CRM3 — Página pública `/pay/:token`

**Objetivo:** cliente vê switch ON por padrão; pode desligar; QR correto.

| Entrega | Critério |
|---------|----------|
| GET pay inclui `pix_automatic` | ✅ |
| `POST …/start-pix-automatic` e `…/cancel-pix-automatic` | ✅ público, token-bound |
| `CustomerInvoicePay`: reuso `PixAutomaticConsentSwitch` + helpers UX | ✅ Default ON; opt-out persiste |
| Disable restaura PIX avulso na UI | ✅ |
| Auto-enable uma vez no 1º acesso se requested e status null | ✅ |

**Closeout:** [`CRM3_CLOSEOUT.md`](./CRM3_CLOSEOUT.md)

**Exit:** smoke: abrir link → ON + QR composto; OFF → avulso; reabrir → OFF. **GO CRM4.**

---

## CRM4 — Renovação CRM (worker)

**Objetivo:** ciclos seguintes usam instrução Pix Auto quando possível.

| Entrega | Critério |
|---------|----------|
| Branch em `executeGatewayChargeForInvoice` (ou ponto equivalente do orchestrator) | ✅ flag ON + auth `active` + janela 2–10 → charge com `pixAutomaticAuthorizationId` |
| Fora da janela / sem auth → path atual avulso | ✅ |
| Audit `pix_automatic.instruction_created` (ou equivalente CRM) | ✅ `origin: crm` |

**Closeout:** [`CRM4_CLOSEOUT.md`](./CRM4_CLOSEOUT.md)

**Exit:** renovação com auth active cria payment Asaas vinculado à auth (staging). **GO CRM5.**

---

## CRM5 — Webhooks, liquidação 1º pagamento e anti-duplicidade

**Objetivo:** 1º pagamento ativa auth **e** confirma fatura CRM; paid não deixa cobrança duplicada do ciclo.

**Referência obrigatória:** [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) (R1–R6).

| Entrega | Critério |
|---------|----------|
| Handler auth events atualiza subscription customer | ✅ ACTIVATED → `active` |
| **ACTIVATED liquida fatura CRM aberta** (`paid` + efeitos) | ✅ |
| Lookup `PAYMENT_*`: `gateway_reference_id` **ou** `conciliationIdentifier` **ou** `pixQrCodeId` → `customer_invoices` / sub | ✅ |
| Provisionar `PIX_AUTOMATIC_*` no webhook tenant (G1) + recreate piloto (G2) | ✅ G1 código; G2 = ops recreate |
| Paid: cancel open charges **do ciclo** no Asaas; **não** cancela auth | ✅ |
| Cancel assinatura CRM cancela auth | ✅ |
| Testes: parser `pixQrCodeId`; ACTIVATED→paid CRM | ✅ |

**Closeout:** [`CRM5_CLOSEOUT.md`](./CRM5_CLOSEOUT.md)

**Exit:** smoke staging: pagar QR composto → Asaas RECEIVED + auth ACTIVE + **`customer_invoices.status = paid`**. Reenvio do mesmo webhook **não** é critério de recovery. **GO CRM6.**

---

## CRM6 — Hardening, ops, closeout

| Entrega | Critério |
|---------|----------|
| Runbook ops CRM (flag, webhooks tenant, rollback) | ✅ [`CRM_PIX_AUTOMATIC_OPS_RUNBOOK.md`](./CRM_PIX_AUTOMATIC_OPS_RUNBOOK.md) |
| Script `settleOrphan*` para `customer_invoices` (espelho SaaS fix1) | ✅ `settleOrphanCrmPixAutomaticPayment.ts` |
| Testes regressão: flag OFF = CRM idêntico | ✅ |
| Copy UX (rótulo switch amigável) | ✅ «Débito automático via PIX» |
| Closeout por sprint + checklist smoke (inclui R5 da lição) | ✅ GO/NO-GO no runbook |
| Fase 1.1 backlog: loja + conversão proposta | ✅ documentado |

**Closeout:** [`CRM6_CLOSEOUT.md`](./CRM6_CLOSEOUT.md)

**Rollback:** flag OFF; charges voltam avulsas; colunas inertes.

**Exit série v1:** runbook + script órfão + regressão flag OFF + copy. Piloto = ops (G2 recreate + smoke R5).

---

## Ordem sugerida de calendário (indicativa)

| Sprint | Foco | Dependência |
|--------|------|-------------|
| CRM0 | Spike + flag | — |
| CRM1 | Store/serviço | CRM0 GO |
| CRM2 | Criação painel | CRM1 |
| CRM3 | `/pay` | CRM1 (pode // CRM2) |
| CRM4 | Worker | CRM1 + auth active path |
| CRM5 | Webhooks | CRM2/3 |
| CRM6 | Ops/QA | CRM2–5 |

---

## Fora desta série (explícito)

- Card auto-renew CRM  
- Assinatura Asaas nativa  
- Collection Policy Engine no CRM  
- Unificar flag SaaS + CRM num único interruptor de produto (pode ser produto futuro; **não** na v1)

---

## Critério de pronto da série (v1)

Operador cria fatura/assinatura CRM com Pix Auto → cliente paga QR composto → auth active **e fatura CRM `paid`** → próximo ciclo pode instruir na janela → cliente pode opt-out de forma persistente → flag OFF restaura comportamento legado sem deploy de rollback de schema.

**Status implementação código:** CRM0–CRM6 entregues (closeouts). **Status piloto:** depende de ops (flag ON + recreate webhook G2 + smoke R5 no runbook).

### Fase 1.1 (backlog explícito)

| Item | Escopo |
|------|--------|
| Conversão proposta → fatura | Toggle/`pix_automatic` no mesmo contrato CRM2 |
| Loja pública | Start auth lazy no `/pay` (deferred CRM3) |
| Unificar flag SaaS+CRM | Fora desta série |

---