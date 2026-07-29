# CRM6 — Closeout (hardening, ops, série v1)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM6 |
| **Runbook** | [`CRM_PIX_AUTOMATIC_OPS_RUNBOOK.md`](./CRM_PIX_AUTOMATIC_OPS_RUNBOOK.md) |
| **Flag** | `crm.pix_automatic` OFF = legado |

---

## Entregue

| Item | Status |
|------|--------|
| Runbook ops (flag, webhook G2, rollback, órfão) | ✅ |
| `settleOrphanPixAutomaticCustomerInvoice` + script CLI | ✅ |
| Testes regressão flag OFF | ✅ |
| Copy UX PT-BR («Débito automático via PIX») | ✅ switch + New + toasts `/pay` |
| Checklist smoke GO/NO-GO (R5) | ✅ no runbook |
| Backlog Fase 1.1 (loja + proposta) | ✅ no runbook / sprints |

---

## Script órfão

```bash
npx tsx src/scripts/settleOrphanCrmPixAutomaticPayment.ts \
  --paymentId=pay_xxx --pixQrCodeId=...ASA
```

**Proibido** como recovery: reenviar o mesmo webhook Asaas.

---

## Série v1 — veredicto

| Sprint | Closeout |
|--------|----------|
| CRM0 | [`CRM0_CLOSEOUT.md`](./CRM0_CLOSEOUT.md) |
| CRM1 | [`CRM1_CLOSEOUT.md`](./CRM1_CLOSEOUT.md) |
| CRM2 | [`CRM2_CLOSEOUT.md`](./CRM2_CLOSEOUT.md) |
| CRM3 | [`CRM3_CLOSEOUT.md`](./CRM3_CLOSEOUT.md) |
| CRM4 | [`CRM4_CLOSEOUT.md`](./CRM4_CLOSEOUT.md) |
| CRM5 | [`CRM5_CLOSEOUT.md`](./CRM5_CLOSEOUT.md) |
| CRM6 | este doc |

**Critério de pronto da série:** operador cria fatura com débito automático → cliente paga QR composto → auth active **e** fatura `paid` → renovação pode instruir na janela → opt-out persiste → flag OFF restaura legado.

**Piloto produção:** seguir checklist do runbook. **NO-GO** se R5 falhar. Recreate webhook (G2) obrigatório antes do smoke.

---

## Rollback

Flag OFF. Charges avulsas. Colunas inertes.
