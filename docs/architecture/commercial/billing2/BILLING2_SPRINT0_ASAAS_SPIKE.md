# Billing 2.0 — Spike Asaas (Sprint 0, discovery only)

**Modo:** somente investigação / checklist comercial-ops.  
**Não** implementa tokenização nem Pix Automático no código.

## Objetivo

Confirmar, **antes** das Sprints 9–10, se a conta Asaas de produção/sandbox do PainelCRM está elegível para:

1. Tokenização de cartão (produção)
2. Pix Automático (BACEN / API Asaas)

## Checklist operacional (preencher com o gerente Asaas / painel)

| Item | Sandbox | Produção | Responsável | Data | Status |
|------|---------|----------|-------------|------|--------|
| API key SaaS global configurada | | | | | |
| Tokenização de cartão habilitada | Sim (doc Asaas) | ? solicitar gerente | | | |
| Pix Automático elegível na conta | ? | ? | | | |
| Webhooks `PAYMENT_*` já configurados | | | | | |
| Webhooks `PIX_AUTOMATIC_*` (futuro S10) | N/A S0 | N/A S0 | | | |
| Conta em ambiente correto (sandbox vs prod) | | | | | |

## Referências oficiais

- [Assinaturas / cartão](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito) — tokenização em produção via gerente
- [Pix Automático](https://docs.asaas.com/docs/pix-automatico)
- [Eventos Pix Automático](https://docs.asaas.com/docs/eventos-para-pix-autom%C3%A1tico)

## Implicações para o plano

| Se… | Então… |
|-----|--------|
| Tokenização prod **ainda não** habilitada | Manter S9 atrás do opt-in comercial; não ligar `card_auto_renew` |
| Pix Automático **não** elegível | Adiar S10; S9 pode adiantar se token OK (PRD permite inverter ordem) |
| Ambos OK | Seguir S8 → S9 → S10 conforme Implementation Plan |

## Divergência conhecida (não alterar na Sprint 0)

- `billingSettingsService.auto_suspend_enabled` tem default legado `true` no storage helper, mas **não governa dunning** hoje e **não** é a flag Billing 2.0.
- Flag Billing 2.0 `auto_suspend` default = **OFF** (PRD §18).
- Reconciliação na Sprint 8+; não misturar com este setting legado até Sprint 3/8.

## Conclusão Sprint 0

Discovery documentado. Preenchimento da tabela acima é **ação humana** (ops/comercial) — não bloqueia gate técnico da Sprint 0 (flags + hub).
