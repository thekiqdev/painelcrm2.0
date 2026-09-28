# Sprint WC2 CLOSEOUT — Meu Plano conexões

| Campo | Valor |
|-------|--------|
| **Sprint** | WC2 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint WC2) |
| **Plano-mãe** | [PLANO_WHATSAPP_CUSTOM_QUANTITY.md](./PLANO_WHATSAPP_CUSTOM_QUANTITY.md) |
| **Detalhe** | [SPRINT_WC2_MEU_PLANO.md](./SPRINT_WC2_MEU_PLANO.md) |
| **Próxima** | WC3 backfill (`OPTIONAL`) — série WC funcional concluída |

---

## Veredito

Hub `/meu-plano` (e aliases `/plano`, `/planos`) mostra contratadas / uso / disponíveis no custom, CTA de extras quando há teto + preço, e mensagem clara se ainda estiver ilimitado. Downgrade agendado funciona com piso do plano NULL (custom via override).

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| UI Meu Plano | Card contratadas; hints custom; hero “Gerir conexões” |
| Ilimitado | Copy → Super Admin / suporte (sem fingir add-on) |
| Sem preço | Mensagem SA; teto permanece |
| Downgrade | `scheduleInstanceDowngradeNextCycle` usa piso `?? 0` se override existe |
| Alias | `/plano`, `/planos` |

---

## Aceite

| Critério | Status |
|----------|--------|
| Custom + teto + preço → compra extras | **Pass** (fluxo WI3 + UX) |
| Custom sem preço → mensagem, não quebra | **Pass** |
| Custom ilimitado → orientação SA | **Pass** |
| Alias hub | **Pass** |

---

## Ops

Tenants custom ainda ilimitados: ver checklist WC1. Backfill assistido = WC3 (opcional).
