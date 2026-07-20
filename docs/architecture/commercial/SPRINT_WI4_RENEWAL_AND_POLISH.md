# Sprint WI4 — Renovação e polimento (conexões WhatsApp)

| Campo | Valor |
|-------|--------|
| **Sprint** | WI4 |
| **Gate** | Em execução → closeout |
| **OK produto** | 2026-07-20 (OK Sprint 4) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) |
| **Closeout** | [SPRINT_WI4_CLOSEOUT.md](./SPRINT_WI4_CLOSEOUT.md) |

---

## Objetivo

1. Renovação SaaS **não esquece** extras de conexões WhatsApp pagas.
2. Permitir **agendar redução** de conexões no próximo ciclo (espelho seats).
3. SA / docs alinhados.

---

## Modelo de renovação

```
amount = renew_seats_or_plan (já existente)
       + max(0, contracted_instances − plan.max_whatsapp_instances)
         × price_per_instance (snapshot ou catálogo)
```

- `contracted_instances` = `scheduled_next` ?? `override` ?? `plan.max`
- Plano com `max` NULL (ilimitado) → extras = R$ 0
- Sem preço (snapshot e catálogo NULL) → extras = R$ 0 (log)

## Schedule

- Coluna `tenants.max_whatsapp_instances_scheduled_next_cycle`
- PUT `/api/me/tenant/instances/schedule-next-cycle`
- No renew: usa o agendado no cálculo; aplica override e limpa schedule
