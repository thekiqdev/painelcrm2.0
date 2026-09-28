# Runbook — Pix Automático CRM (`customer_invoices`)

| Campo | Valor |
|-------|-------|
| **Flag** | `crm.pix_automatic` (plataforma) — default **OFF** |
| **Independente** | Não confundir com `billing2.pix_automatic` (SaaS) |
| **Closeouts** | CRM0–CRM8 em `docs/architecture/commercial/crm-pix-automatic/` |
| **Lição 1º pagamento** | [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) |

---

## Princípio

PainelCRM é o **cérebro**; Asaas (conta **do tenant**) é o **executor**.  
Flag OFF = cobranças CRM idênticas ao legado (PIX avulso); colunas `pix_automatic_*` ficam inertes.

---

## Ligar produto (piloto)

1. Super Admin → flag `crm.pix_automatic` = **ON**.
2. Tenant com Asaas CRM conectado e **Pix Automático elegível**.
3. **G2 — recreate webhook** do tenant (connect reusa webhook sem atualizar events):
   - UI/API: `POST …/asaas/recreate-webhook` (ou fluxo equivalente de integração Asaas).
   - Confirmar events: `PAYMENT_*` + `PIX_AUTOMATIC_*`.
4. Smoke R5 (obrigatório):
   - Criar fatura/assinatura com toggle **Débito automático via PIX** ON.
   - Cliente paga QR composto no `/pay`.
   - Asaas: RECEIVED + auth ACTIVE.
   - Painel: **`customer_invoices.status = paid`**.
   - Se auth ACTIVE e fatura ≠ paid → **NO-GO** / usar script órfão abaixo.
5. Smoke CRM8 (opcional): na assinatura **sem** fatura aberta, ligar o switch → badge **«Débito PIX pedido»**; gerar próxima cobrança → status passa a **pendente**/QR.

---

## Órfão do 1º pagamento (NÃO reenviar webhook)

Se o `PAYMENT_RECEIVED` do QR composto chegou com `paymentId` novo, sem `externalReference`, e a fatura CRM ficou `pending`:

1. **Não** reenvie o mesmo evento no painel Asaas (idempotência já marcou processado).
2. Use o script:

```bash
# cwd packages/backend
npx tsx src/scripts/settleOrphanCrmPixAutomaticPayment.ts \
  --paymentId=pay_NOVO \
  --pixQrCodeId=...ASA \
  [--conciliationId=...] \
  [--invoiceId=uuid] \
  [--authorizationId=...]

# Docker / dist
node dist/scripts/settleOrphanCrmPixAutomaticPayment.js \
  --paymentId=pay_NOVO \
  --pixQrCodeId=...ASA
```

3. Esperado: `{ "ok": true, "invoice_id": "..." }` e fatura `paid`.
4. Espelho SaaS (plano): `settleOrphanPixAutomaticPayment.ts` — **não** misturar com CRM.

---

## Rollback

1. Flag `crm.pix_automatic` = **OFF**.
2. Opcional: cancelar autorizações no Asaas (`DELETE …/authorizations/{id}`) por subscription customer.
3. Schema: manter colunas (inertes). Sem deploy de rollback de migration.
4. Worker volta a criar só charge avulsa; `/pay` deixa de oferecer switch (gate).

---

## Operação do dia a dia

| Situação | Ação |
|----------|------|
| Cliente desliga switch no `/pay` | Auth cancelada + opt-out `cleared`; PIX avulso restaurado |
| Cancelar assinatura CRM | Cancela auth (fail-open) |
| Renovação com auth `active` | Instrução na janela 2–10 úteis; fora → avulso |
| Auth lost / refused | Status local atualizado; próximo ciclo avulso até nova autorização |

---

## Checklist smoke piloto (GO / NO-GO)

| # | Critério | GO se |
|---|----------|-------|
| 1 | Flag OFF | Fluxo CRM legado sem regressão |
| 2 | Flag ON + recreate webhook | Eventos `PIX_AUTOMATIC_*` chegam |
| 3 | Create + `/pay` | Switch ON + QR composto |
| 4 | Opt-out | OFF persiste ao reabrir link |
| 5 | **R5** 1º pagamento | Auth ACTIVE **e** fatura CRM `paid` |
| 6 | Renovação (staging) | Instrução com `pixAutomaticAuthorizationId` na janela |
| 7 | Órfão simulado | Script settle recupera; reenvio webhook **não** é recovery |

**NO-GO piloto** se #5 falhar.

---

## Fase 1.1 (backlog — fora da v1 fechada)

| Item | Notas |
|------|-------|
| Toggle Pix Auto na **conversão proposta → fatura** | Mesmo contrato `pix_automatic` do CRM2 |
| **Loja** (`storePublicCheckoutService`) | Start auth lazy no `/pay` (deferred como CRM3) |
| Não unificar flag SaaS+CRM | Produto futuro explícito fora desta série |
