# Política de preço contratado (SaaS)

**Objetivo:** registrar a regra comercial do **preço contratado** vs **preço público** do catálogo.  
**Público:** produto, suporte e QA em staging/beta.

---

## Regra comercial

1. **Alterar o preço público do plano** (`plans` / `plan_interval_prices`) **afeta apenas novas contratações** — o valor cobrado no checkout segue o catálogo **no momento da compra**, e passa a ser registrado como contrato daquele tenant (snapshot na assinatura e na linha de fatura quando aplicável).

2. **Tenants já contratados** continuam **renovando pelo preço contratado** guardado na assinatura SaaS (`subscriptions.contracted_*`), desde que o snapshot exista e a renovação use esse snapshot (não o catálogo atual).

3. **Novos usuários adicionais** em tenants que já têm plano **custom** por assento: a base de cobrança (pró-rata do seat addon e o `amount_cents` da assinatura após confirmação) deve usar o **preço contratado por usuário** (`contracted_price_per_user_cents`), **não** o preço público atual em `plan_interval_prices`.

4. **Upgrade, downgrade ou troca de intervalo** representam **novo contrato** para aquele tenant: o sistema pode passar a usar **novos valores** alinhados ao plano/intervalo escolhido e atualizar o snapshot contratual conforme os fluxos de mudança explícita de contrato (não se aplica à mera renovação do mesmo contrato).

---

## Validação em staging / beta (checklist)

Cenário base: tenant contratou a **R$ 49,90** (por usuário ou plano, conforme o tipo); em seguida o **preço público** do mesmo plano foi alterado para **R$ 69,90**.

| # | Verificação esperada |
|---|----------------------|
| 1 | **Renovação** do tenant antigo continua em **R$ 49,90** (valor contratado). |
| 2 | **Adicionar usuário** (seat addon / linha proporcional) usa **R$ 49,90** como base por usuário contratado, não R$ 69,90. |
| 3 | **Novo tenant** que contrata após a mudança paga **R$ 69,90** (catálogo vigente na contratação). |
| 4 | **Troca de plano ou de intervalo** pelo fluxo de mudança de contrato reflete o **novo valor** acordado naquele momento (novo contrato), não a renovação automática silenciosa do ciclo anterior. |

---

## Referências técnicas no repositório

- Snapshot na assinatura e renovação: `packages/backend/src/services/billingService.ts` (`calculateSaasRenewalInvoiceAmount`, `tryResolveSaasRenewalAmountFromContractSnapshot`).
- Checkout / primeira gravação do snapshot: `packages/backend/src/services/billingSubscriptionService.ts`, `packages/backend/src/services/subscriptionService.ts`.
- Seat addon e alinhamento de `amount_cents` ao contrato: `tryResolveSubscriptionLineAmountFromContractSnapshot`, `calculateSeatAddonProrata`, `tenantSeatCommercialService.ts`, `changeSubscriptionPlan` em `billingSubscriptionService.ts`.

Investigação de estrutura e histórico: `docs/BILLING_PRICING_SNAPSHOT_STRUCTURE_INVESTIGATION.md`.
