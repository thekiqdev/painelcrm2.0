# Decisões — Pix Automático nas faturas / assinaturas CRM

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Entrada** | [`AUDIT_CRM_PIX_AUTOMATIC_PIPELINE.md`](./AUDIT_CRM_PIX_AUTOMATIC_PIPELINE.md) |
| **Referência produto SaaS** | `docs/architecture/commercial/billing2/BILLING2_PIX_AUTOMATIC_OPS.md` + closeouts S10/A/B/C |
| **Constraint** | **Não mudar arquitetura** — estender paths existentes |

---

## Princípios

1. **PainelCRM = cérebro** (ciclo, valor, envio, preferência). **Asaas = executor** (auth + instruções).
2. **Paridade de produto com SaaS**, path CRM separado (gateway `scope=tenant`, entidades `customer_*`).
3. **Sem** assinatura Asaas nativa, **sem** novo motor de cobrança, **sem** nova tabela de “preferência solta” se der para reutilizar `subscriptions` + metadata da fatura.
4. Flag / capability **opt-in**; default de plataforma seguro (desligado até o tenant habilitar e a conta Asaas for elegível).

---

## D1 — Escopo da v1

| Inclui | Não inclui (v1) |
|--------|-----------------|
| Fatura manual com Pix Auto na criação/envio | Card token / cobrança automática cartão CRM |
| Assinatura CRM (`type=customer`): 1ª fatura + ciclos com auth `active` | Redesign de `/pay` ou do worker |
| Link `/pay/:token`: switch default ON, opt-out | Mercado Pago |
| Webhook auth + liquidação `PAYMENT_*` amarrada à fatura CRM | Loja sem charge na criação (fase 1.1 se necessário) |
| Restore PIX avulso ao desligar | Collection Policy Engine SaaS no CRM |

**Decisão:** v1 cobre **manual + recorrente CRM** no painel. Proposta/loja entram como **fase 1.1** (mesmo contrato de metadata/flag na fatura), sem arquitetura nova.

---

## D2 — SSOT da autorização

| Decisão | Detalhe |
|--------|---------|
| **Onde fica a auth** | Colunas `pix_automatic_*` em **`subscriptions`**, também para `type = 'customer'` (mesmas colunas da migration 301 — estender uso/índices se precisarem, **sem** tabela nova) |
| **Fatura avulsa sem assinatura** | Criar **draft/link** mínimo: ou (a) assinatura `customer` one-shot/trialing ligada à fatura, ou (b) metadata na fatura + auth id até paid. **Preferência: (a)** espelhando Sprint A SaaS (`subscription_id` na fatura antes do paid), para reutilizar store/serviço |
| **Preferência OFF** | Status `cleared` / `cancelled` / `refused` / `expired` = opt-out; **não** reaplicar default ON na mesma assinatura até o usuário ligar de novo |
| **Intenção “esta fatura quer Pix Auto”** | Flag booleana na criação persistida em `customer_invoices.gateway_metadata` (ex.: `pix_automatic_requested: true`) **e/ou** coluna dedicada só se metadata ficar frágil — **preferir metadata** na v1 para não alterar schema além do estritamente necessário nas colunas já existentes de `subscriptions` |

**Decisão:** SSOT de auth = `subscriptions` (customer). Intenção por fatura = `gateway_metadata` (+ stash `standalone_pix_*` como no SaaS).

---

## D3 — Momento de criar a autorização Asaas

| Opção | Prós | Contras |
|-------|------|---------|
| A) No createCharge da criação | QR composto já no envio | Falha Asaas bloqueia criação |
| B) Lazy no primeiro GET `/pay` | Criação de fatura sempre ok | Cliente pode ver atraso / PIX avulso flash |
| C) Híbrido: intenção no create; start auth no “enviar/publicar” ou no 1º open do pay com retry | Melhor UX ops | Dois passos |

**Decisão: A + degradação.** Se toggle ON na criação e gateway Asaas + CPF ok → `createPixAutomaticAuthorization` (immediateQrCode) **no mesmo fluxo** que hoje faria PIX avulso. Se Asaas falhar (404 produto, parse, etc.) → **persistir fatura com PIX avulso** + aviso ao operador (não abortar a fatura). QR composto substitui apresentação PIX na metadata (com stash do avulso se já existir).

---

## D4 — Default ON e opt-out no `/pay`

| Regra | Comportamento |
|-------|----------------|
| Fatura com `pix_automatic_requested` / journey authorization / auth `pending` | Switch **ON** por padrão; auto-enable só se ainda não houver auth e status null |
| Cliente desliga | Cancel auth Asaas (se houver) ou `cleared`; restore PIX avulso; **persiste** opt-out na assinatura |
| Cliente religa | Nova auth na **mesma** fatura aberta (não cria fatura nova) — paridade SaaS |
| Auth já `active` | Switch ON; não recria auth |

**Decisão:** copiar UX/helpers SaaS (`PixAutomaticConsentSwitch`, `pixAutomaticCheckoutUx`) no `CustomerInvoicePay`, sem inventar componente paralelo de arquitetura — **reuso do componente** existente.

---

## D5 — Recorrência (ciclos seguintes)

| Decisão | Detalhe |
|--------|---------|
| Auth `active` + vencimento na janela 2–10 dias úteis | `createCharge` / execução gateway com `pixAutomaticAuthorizationId` (instrução) |
| Fora da janela ou auth perdida | Charge PIX avulso (comportamento atual do worker) |
| Paid no ciclo | Cancelar cobranças abertas **do ciclo** no Asaas; **não** cancelar a auth (paridade Sprint B) |
| Cancelamento da assinatura CRM | Cancelar auth Asaas + status local |

**Decisão:** encaixe no `executeGatewayChargeForInvoice` / worker CRM — branch opt-in, sem novo worker.

---

## D6 — Flags e elegibilidade

| Camada | Decisão |
|--------|--------|
| Plataforma | Flag **`crm.pix_automatic`** default **OFF** (namespace `crm`; **não** reutilizar só `billing2.pix_automatic`) |
| Tenant | Conta Asaas tenant com produto Pix Automático; capability `pixAutomatic` no gateway_key |
| UI criação | Toggle só aparece se flag ON **e** gateway ativo é Asaas **e** capability |

**Decisão:** dual gate (flag plataforma + capability/config tenant). Sem flag ON, CRM inalterado.

---

## D7 — Webhooks e liquidação do 1º pagamento (atualizado pós-incidente SaaS)

| Evento | Ação CRM |
|--------|----------|
| `PIX_AUTOMATIC_*_AUTHORIZATION_ACTIVATED` | Atualizar `subscriptions` customer **e liquidar** `customer_invoice` aberta ligada à auth (`paid` + efeitos CRM). Jornada 3: ACTIVATED ⇒ 1º pagamento já liquidou no Asaas |
| `PAYMENT_*` | Lookup por `gateway_reference_id` **ou** `conciliationIdentifier` **ou** `pixQrCodeId` → metadata/`subscriptions.pix_automatic_conciliation_id`; depois path paid usual |
| Instruction refused / auth lost | Fallback: próxima cobrança avulsa (log/audit); sem novo engine |

**Decisão:** estender `webhookCore` / service existente — **não** webhook paralelo.

**Obrigatório (lição 2026-07-29):** ver [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md).  
Não repetir: auth `active` com fatura CRM ainda `pending`. Reenvio de webhook **não** é estratégia de recuperação (idempotência) — script órfão em CRM6.

---

## D8 — APIs públicas / autenticadas

| Superfície | Decisão |
|------------|--------|
| Público | `POST /api/public/customer-invoices/pay/:token/start-pix-automatic` e `…/cancel-pix-automatic` (espelho saas-pay) |
| Auth tenant | Opcional v1: preferência na assinatura CRM via detalhe `/crm-subscriptions/:id` (switch); se não couber no prazo, só `/pay` + toggle na criação |
| GET pay | Incluir bloco `pix_automatic: { available, switch_on, status, user_opted_off, qr_* }` |

---

## D9 — O que explicitamente **não** muda

- Modelo fatura + attempts + payment_token
- Worker CRM e `billing_recurring_jobs`
- Separação gateway tenant vs global
- Liquidação por status do payment Asaas
- Arquitetura billing2 SaaS (continua independente)

---

## D10 — Critérios de aceite (produto)

1. Operador cria fatura/assinatura com switch Pix Auto ON → cliente abre `/pay` com switch ON e QR composto (quando Asaas ok).
2. Cliente desliga → PIX avulso; ao reabrir, permanece OFF.
3. Cliente paga 1º QR → auth `active` **e** fatura CRM do ciclo **`paid`** (Asaas RECEIVED sozinho não basta); ciclos seguintes podem debitar via instrução na janela.
4. Flag OFF ou Asaas inelegível → fluxo CRM idêntico ao de hoje.
5. Nenhuma mudança de arquitetura além de colunas/metadata/endpoints nos pontos E1–E9 da auditoria.
6. Smoke falha se auth ACTIVE / payment RECEIVED e `customer_invoices.status` ≠ `paid` ([`LESSONS_…`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) R5).

---

## Próximo

Plano de sprints: [`SPRINTS_CRM_PIX_AUTOMATIC.md`](./SPRINTS_CRM_PIX_AUTOMATIC.md)  
Spike CRM0 (achados): [`CRM0_SPIKE.md`](./CRM0_SPIKE.md)  
Lição 1º pagamento: [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md)
