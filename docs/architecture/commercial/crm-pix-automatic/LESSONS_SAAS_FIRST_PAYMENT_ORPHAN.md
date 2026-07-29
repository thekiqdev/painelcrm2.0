# Lição SaaS — 1º pagamento Pix Automático órfão (obrigatório no CRM)

| Campo | Valor |
|-------|-------|
| **Data incidente** | 2026-07-29 |
| **Branch fix SaaS** | `deploy-v1.1.4.23-automaticpix-fix1` (`91f0782`) |
| **Escopo desta nota** | **Não repetir** o mesmo buraco no path CRM (`customer_invoices`) |
| **Relacionados** | [`CRM0_SPIKE.md`](./CRM0_SPIKE.md) · [`DECISIONS_CRM_PIX_AUTOMATIC.md`](./DECISIONS_CRM_PIX_AUTOMATIC.md) D7 · CRM5 em [`SPRINTS_CRM_PIX_AUTOMATIC.md`](./SPRINTS_CRM_PIX_AUTOMATIC.md) |

---

## O que aconteceu (SaaS)

1. Cliente pagou o **QR composto** da autorização (Jornada 3).
2. Asaas gerou uma **cobrança nova**: descrição *"Cobrança gerada automaticamente a partir de Pix recebido."*
3. Webhook `PAYMENT_RECEIVED` chegou com:
   - `payment.id` **novo** (≠ `gateway_reference_id` da fatura do plano)
   - `externalReference: null`
   - **sem** `conciliationIdentifier` no payload
   - `pixQrCodeId` presente (ex.: `…ASA`)
4. Handler respondeu **200**, mas o domínio marcou entidade não encontrada → **fatura/plano continuou pendente**.
5. Reenviar o **mesmo** webhook **não** corrige: idempotência (`event_id` / `payload_hash` / `payment_events`) ignora reprocessamento.

Fatura Asaas “do plano” (ex. `868794880` + external ref UUID) ≠ fatura automática Asaas (ex. `868798444`).

---

## Causas-raiz (duas)

| # | Causa | Efeito |
|---|--------|--------|
| 1 | Lookup de `PAYMENT_*` só por `payment.id` ≡ `gateway_reference_id` (e conciliation só se campo oficial viesse) | 1º pagamento Pix Auto **não** acha a fatura |
| 2 | `AUTHORIZATION_ACTIVATED` atualizava auth / às vezes `gateway_reference_id`, mas **não** chamava `applyPaymentEvent` → **não** marcava `paid` / não ativava plano | Mesmo com auth `active`, cobrança interna pendente |

---

## Correção SaaS (já no fix1) — espelhar no CRM

1. Parser: se não houver `conciliationIdentifier`, usar **`pixQrCodeId`** como chave de conciliação.
2. Lookup: `pix_automatic_conciliation_id` em metadata da fatura **e** em `subscriptions.pix_automatic_conciliation_id`.
3. Em **`AUTHORIZATION_ACTIVATED`**: achar fatura aberta pela auth/subscription e **liquidar** (`applyPaymentEvent` / equivalente CRM → `paid` + efeitos de negócio).
4. Script ops de órfão: `settleOrphanPixAutomaticPayment` (SaaS); CRM precisará análogo para `customer_invoices`.

---

## Regras obrigatórias no plano CRM (não negociáveis)

### R1 — Dupla via de liquidação do 1º pagamento

Qualquer um dos caminhos deve liquidar a `customer_invoice` aberta:

- **A)** `PAYMENT_RECEIVED` / `CONFIRMED` resolvido por: `gateway_reference_id` **ou** `conciliationIdentifier` **ou** `pixQrCodeId` → metadata/subscription CRM  
- **B)** `PIX_AUTOMATIC_…_AUTHORIZATION_ACTIVATED` → **sempre** tenta marcar fatura CRM aberta ligada à auth como **paid** (1º pagamento já liquidou no Asaas por definição da Jornada 3)

Não depender só de A. Não depender só de B.

### R2 — Nunca assumir que o `payment.id` do webhook = charge avulso antigo

Após `start` da auth, a fatura pode ainda apontar para PIX avulso antigo. O payment do QR composto pode ser **outro** id. Sempre reconciliar por conciliation / pixQrCodeId / auth id.

### R3 — Webhooks tenant com eventos Pix Auto

Sem `PIX_AUTOMATIC_*` no webhook da conta Asaas do tenant, o caminho B não existe. Provisionar + recreate nos tenants piloto (ver CRM0 G1/G2).

### R4 — Idempotência ≠ recuperação

Evento já `processed` com “entidade não encontrada” **não** se auto-corrige no reenvio. Runbook CRM: [`CRM_PIX_AUTOMATIC_OPS_RUNBOOK.md`](./CRM_PIX_AUTOMATIC_OPS_RUNBOOK.md) — script `settleOrphanCrmPixAutomaticPayment` + critério de quando usar. **Não** reenviar o mesmo webhook.

### R5 — Critério de aceite de smoke (CRM5 / piloto)

Smoke **reprovado** se: Asaas mostra RECEIVED + auth ACTIVE e `customer_invoices.status` ≠ `paid`.  
Smoke **aprovado** só com fatura CRM paga + (se aplicável) recorrência/auth coerentes.

### R6 — Testes automatizados mínimos

- Parser: payload sem `conciliationIdentifier`, com `pixQrCodeId` → metadata de conciliação preenchida.  
- Webhook/domínio: ACTIVATED com fatura CRM aberta → `paid`.  
- Lookup: conciliation só na subscription ainda encontra a fatura.

---

## Onde encaixa nos sprints

| Sprint | O que fazer com esta lição |
|--------|----------------------------|
| CRM1 | Store customer; ao persistir auth, **sempre** gravar `pix_automatic_conciliation_id` na sub **e** na metadata da fatura |
| CRM5 | **Núcleo:** R1–R3 + liquidação CRM; não fechar sprint sem smoke R5 |
| CRM6 | Script órfão CRM + runbook “não reenviar webhook; usar script” |
| CRM0 | Já documentado; atualizar verdict com G10 (esta lição) |

---

## Anti-padrões (proibido no CRM)

- Tratar 200 no webhook Asaas como “pagamento confirmado no PainelCRM”.
- Liquidar só se `externalReference` vier preenchido.
- Atualizar só `pix_automatic_auth_status = active` sem tocar status da fatura do 1º ciclo.
- Confiar em reenvio manual do painel Asaas para consertar órfão.
