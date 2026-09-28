# Billing 2.0 — Declaração MVP

| Campo | Valor |
|-------|-------|
| **Escopo** | Super Admin Billing 2.0 (SaaS plataforma) |
| **Sprints** | 0–8 |
| **Data** | 2026-07-27 |
| **Status código** | MVP implementado (flags OFF em prod) |
| **Status produto** | Aguardando QA + aprovação formal |

## Incluído no MVP

1. Feature Flags (`billing2.*`) com precedência DB → env → catálogo  
2. Collection Policy (DB + interpret/execute) atrás de engine flag  
3. UI Cobrança Automática  
4. Assinaturas SA list/detail + writer `past_due` (flag)  
5. Dashboard financeiro (MRR contratado opcional)  
6. Logs / audit export + Webhooks health + reprocess seguro  
7. Reconciliação L2 (`getPayment`) + Dunning cycle (flags)  

## Explicitamente fora (pós-MVP)

- S9 Token cartão  
- S10 Pix Automático — implementada (flag OFF; ver `BILLING2_SPRINT10_CLOSEOUT.md`)
- S11 Multi-gateway — implementada (flag OFF; skeleton Stripe; ver `BILLING2_SPRINT11_CLOSEOUT.md`)
- S12 Hardening / chaos  

## Gate de go-live gradual

- [ ] Smoke L2 staging  
- [ ] Dunning timeline staging (sem suspend)  
- [ ] Suspend/reactivate E2E com flags ON só em staging  
- [ ] Regressão renovação legado com todas flags OFF  
- [ ] Aprovação produto (demo PRD §19)  

**Último gate executado (2026-07-27):** [`BILLING2_MVP_QA_GATE_GO_NO_GO.md`](./BILLING2_MVP_QA_GATE_GO_NO_GO.md) → **NO-GO** (migrations 298/299 fora do order; audit ausente; API down; E2E/demo pendentes). Evidências em `evidence/`.
