# Plano de sprints — Contract Sync (CS)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Tipo** | Correção comercial (assinatura + pagamentos) |
| **Nome** | **CS — Sync de contrato em upgrade/downgrade** |
| **Status** | **S1–S3 feitos** |
| **Contexto** | Após pagar contratação/upgrade (ex. R$ 500), Meu Plano e renovação continuavam no valor antigo/catálogo (ex. R$ 69) |

---

## 1. Meta

1. Pagamento de `plan_purchase` / `plan_upgrade` / `manual_charge` **sempre** sincroniza `subscriptions.amount_cents` e snapshot contratado.
2. Faturas de renovação abertas acompanham o novo contrato (S2).
3. Meu Plano exibe o valor contratado, não o catálogo solto (S3).

---

## 2. Decisões

| ID | Decisão |
|----|----------|
| **D-CS.1** | Fonte do valor comercial pós-pagamento = `tenant_billing.amount_cents` da fatura que ativou |
| **D-CS.2** | `plan_purchase` **pode** sobrescrever snapshot em modo `explicit` (recontratação com `contracted_at` já preenchido) |
| **D-CS.3** | `plan_renewal` **não** sobrescreve snapshot via activate (continua só engine de renovação) |
| **D-CS.5** | Após ativação contratual: cancelar **todas** `plan_renewal` abertas; se havia alguma, recriar pendente da **próxima** competência no valor contratado (sem charge gateway) |
| **D-CS.6** | `findInvoiceBySubscriptionAndPeriod` ignora `cancelled` para o job poder reemitir o ciclo |
| **D-CS.7** | UI / GET subscription preferem `contracted_*` (custom: unit × seats) sobre catálogo |
| **D-CS.8** | Troca de plano sem checkout usa `PATCH /subscription` (sync amount + snapshot + `tenants.plan_id`) |

---

## 3. Sprints

| Sprint | Escopo | Status |
|--------|--------|--------|
| **S1** | Sync `amount_cents` + snapshot no activate; alinhar draft open billing | **Feito** |
| **S2** | Cancelar/regerar `plan_renewal` abertas após mudança contratual paga | **Feito** |
| **S3** | Meu Plano: hero/próxima cobrança usam snapshot; downgrade de plano/assentos na UI | **Feito** |

---

## 4. Aceite S1

- [x] Assinatura **já ativa** com períodos preenchidos: activate de `plan_purchase` atualiza `amount_cents` (e plano/intervalo/users) a partir da fatura paga
- [x] Snapshot `contracted_plan_price_cents` atualiza em recontratação (`plan_purchase` + `explicit`) mesmo com `contracted_at` já setado
- [x] `plan_renewal` continua **fora** do overwrite de snapshot no activate
- [x] `ensureSaasSubscriptionLinkedToOpenBilling` alinha `amount_cents` da sub open/trialing/active com a fatura aberta
- [x] Testes de `shouldPersistContractSnapshotMode` + helper de sync comercial
- [x] S2/S3 não misturados nesta entrega

---

## 4.1 Aceite S2

- [x] Após `plan_purchase` / `plan_upgrade` / `manual_charge` pago: `plan_renewal` abertas são canceladas
- [x] Best-effort `cancelPayment` no gateway para refs das canceladas
- [x] Se havia renovação aberta: recria pendente da próxima competência com `expectedAmount` (snapshot/`amount_cents`)
- [x] 1ª contratação sem histórico de renewal **não** inventa fatura futura
- [x] `findInvoiceBySubscriptionAndPeriod` ignora `cancelled` (job pode reemitir)
- [x] `plan_renewal` pago **não** dispara este reconcile
- [x] S3 não misturado

---

## 4.2 Aceite S3

- [x] GET `/api/me/tenant/subscription` expoe `contracted_*` e `amount_cents` resolvido pelo snapshot
- [x] Meu Plano hero + “Valor previsto” usam valor comercial contratado (não catálogo)
- [x] Downgrade de assentos: texto + estimativa com unitário contratado quando houver
- [x] Troca de plano (sem checkout) via PATCH subscription + sync `tenants.plan_id` + reconcile renewals
- [x] Comparação upgrade/downgrade no catálogo usa `mainDisplayPriceCents` contratado

---

## 5. Kickoff

- **`ok sprint 1`** — sync activate
- **`ok sprint 2`** — pagamentos/renovações abertas
- **`ok sprint 3`** — Meu Plano + downgrade UI
