# CRM4 — Closeout (renovação / instrução Pix Auto)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM4 |
| **Flag** | `crm.pix_automatic` — sem flag, path legado intacto |
| **Paridade** | Espelho `createPixAutomaticInstructionForBilling` + branch `executeSaasRenewal` |

---

## Entregue

| Item | Status |
|------|--------|
| `createPixAutomaticInstructionForCustomerInvoice` | ✅ janela 2–10 via store billing2 |
| Branch em `executeGatewayChargeForInvoice` | ✅ auth `active` → instrução; senão / fora janela → avulso |
| `createCharge` com `pixAutomaticAuthorizationId` | ✅ |
| Metadata `pix_automatic_journey: 'instruction'` | ✅ |
| Audit `pix_automatic.instruction_created` (`origin: crm`) | ✅ |
| Testes unitários (flag / auth / janela / happy / idempotência) | ✅ |

---

## Comportamento

1. Worker CRM gera fatura do ciclo → `executeGatewayChargeForInvoice`.
2. Se flag ON + auth `active` + 2–10 dias úteis até o vencimento → charge Asaas com `pixAutomaticAuthorizationId` (sem PIX avulso).
3. Fora da janela, sem auth, flag OFF ou falha Asaas → path atual de cobrança avulsa (sem regressão).
4. **Não** inicia auth nova na renovação (start continua CRM2/3).

---

## Exit

**GO CRM5** (webhooks + liquidação 1º pagamento + anti-duplicidade).

Smoke staging sugerido: auth ACTIVE + due na janela → payment Asaas com vínculo à auth.
