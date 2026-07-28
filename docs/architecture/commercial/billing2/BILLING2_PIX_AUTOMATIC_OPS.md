# Billing 2.0 Sprint 10 — Pix Automático (ops / BACEN)

## Princípio

PainelCRM é o **cérebro** (ciclo, valor, policy). Asaas é o **executor** da autorização Pix Automático (BACEN).  
Flag `billing2.pix_automatic` default **OFF** — sem migração silenciosa.

## Fluxo

0. **Sprint A — 1º pagamento** — fatura de checkout (`plan_purchase` / upgrade / renewal) recebe `subscription_id` **antes** do paid via draft `subscriptions.status = trialing` (`ensureSaasSubscriptionLinkedToOpenBilling`). Sem isso, `/saas-pay` → start Pix Auto retornava `missing_subscription_id`. No paid, draft vira `active`.
1. **Consentimento (Jornada 3)** — `POST /pix/automatic/authorizations` com `immediateQrCode`  
   → QR composto (1ª cobrança + autorização). Status local: `pending` → webhook `…_ACTIVATED` → `active`.
2. **Instruções futuras** — `POST /payments` com `pixAutomaticAuthorizationId`  
   → só com auth `active` e **janela 2–10 dias úteis** antes do vencimento.
3. **Liquidação** — continua pelos webhooks `PAYMENT_*` (não pelos eventos de autorização).

## Feature Flag

| Flag | Default | Efeito |
|------|---------|--------|
| `billing2.pix_automatic` | OFF | OFF = PIX avulso / fluxo atual; ON = auth + instruções |

Policy `pix_automatic_enabled` só emite action `create_pix_automatic_instruction` se true **e** flag ON no executor.

## Webhooks a habilitar no Asaas

- `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_*` (created/activated/cancelled/expired/refused)
- `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_*` (created/scheduled/refused/cancelled)
- Manter `PAYMENT_*` existentes

## Persistência

| Campo | Tabela |
|-------|--------|
| `pix_automatic_authorization_id` | `subscriptions` |
| `pix_automatic_auth_status` | pending \| active \| cancelled \| expired \| refused \| cleared |
| QR pending | `pix_automatic_qr_*` (limpo ao ativar) |
| Conciliation 1º pagamento | `pix_automatic_conciliation_id` + `tenant_billing.gateway_metadata` |

## Auth lost / instruction refused

→ Collection Policy: `pix_automatic.authorization_lost` / `pix_automatic.instruction_refused`  
→ fallback `create_pix` (PIX avulso) se `generate_pix_after_failure` / actions_after_fail.

## Rollback

1. Super Admin → `billing2.pix_automatic` = OFF  
2. Opcional: cancelar autorização no Asaas (`DELETE …/authorizations/{id}`)  
3. Colunas em `subscriptions` podem permanecer (inertes)

## Pré-requisito

Conta Asaas com **Pix Automático elegível** (ver spike S0). Sandbox pode diferir de produção.

## Sprint A vs B vs C

| | Sprint A | Sprint B | Sprint C (agora) |
|--|----------|----------|------------------|
| Flag default | OFF | OFF | OFF (UI some se OFF) |
| 1º pagamento / subscription | Draft `trialing` + link | — | — |
| Paid manual | — | Cancela **só** cobranças abertas **do ciclo** | — |
| Switch / SSOT | — | — | Preferência na **assinatura**; telas compartilham |
| Cancel plano | — | — | Cancela **auth** Asaas |

Closeouts: [`A`](./BILLING2_SPRINT_A_PIX_AUTO_FIRST_PAYMENT_CLOSEOUT.md) · [`B`](./BILLING2_SPRINT_B_CYCLE_PAID_CLEANUP_CLOSEOUT.md) · [`C`](./BILLING2_SPRINT_C_PIX_AUTO_SWITCH_CLOSEOUT.md)

## Switch (Sprint C) — fonte única

| Superfície | Comportamento |
|------------|---------------|
| `/saas-pay` | Switch ON/OFF (público) |
| `/checkout`, Internal checkout | Mesmo SSOT (auth tenant); sem seat/instance addon |
| Meu plano | Sempre visível se flag ON (OFF cancela auth; ON precisa fatura aberta) |

APIs: `GET/POST /api/me/tenant/pix-automatic*` · `POST …/cancel-pix-automatic` (público)

## Anti-duplicidade (Sprint B)

Ao liquidar `tenant_billing` (`paid`):

- Cancela payments/instruções **abertas daquela fatura** no Asaas (`cancelPayment` / DELETE), exceto o payment vencedor  
- **Não** cancela a autorização Pix Automático — o próximo ciclo pode gerar nova instrução  
- Fail-open: falha no cancel não impede o paid

## Proibido

- Ligar flag em prod sem piloto opt-in  
- Usar Assinatura nativa Asaas como SSOT  
- Criar instrução fora da janela 2–10 dias úteis  
- Tratar draft `trialing` como elegível ao scheduler de renovação  
- No paid manual: cancelar a **autorização** recorrente (só switch OFF / cancel plano)  
- Estado do switch gravado só na fatura ou só no front (quebra SSOT)
