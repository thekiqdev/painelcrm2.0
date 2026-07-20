# Sprint WC1 CLOSEOUT — Quantidade WhatsApp no custom

| Campo | Valor |
|-------|--------|
| **Sprint** | WC1 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint 1) |
| **Plano-mãe** | [PLANO_WHATSAPP_CUSTOM_QUANTITY.md](./PLANO_WHATSAPP_CUSTOM_QUANTITY.md) |
| **Detalhe** | [SPRINT_WC1_CUSTOM_WHATSAPP_QUANTITY.md](./SPRINT_WC1_CUSTOM_WHATSAPP_QUANTITY.md) |
| **Próxima** | WC2 — Meu Plano (`DONE`) |

---

## Veredito

Novos tenants em plano **custom** exigem `max_whatsapp_instances_override`. API e SA bloqueiam omissão. Limites SA não permitem teto abaixo do uso. Catálogo custom documenta piso inclusas + preço por extra. Tenants legados ilimitados **não** são alterados automaticamente (WC3).

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Helper | `customPlanWhatsAppContract.ts` + testes |
| API | `createTenant` / `updateTenant` / `putTenantLimits` |
| SA | `SuperAdminClientNew`, `SuperAdminClientLimites` |
| Catálogo | piso + copy em `SuperAdminPlans` (custom) |
| Usage | `plan_type` no GET usage |

---

## Aceite

| Critério | Status |
|----------|--------|
| Custom novo sem qtd. WA → 400 | **Pass** |
| Limites: null WA em custom → bloqueado UI/API | **Pass** |
| Override &lt; uso atual → 400 | **Pass** |
| Legado ilimitado intacto até backfill | **Pass** (D8) |

---

## Ops — checklist custom sem teto

```sql
SELECT t.id, t.name, t.slug, t.status,
       t.max_whatsapp_instances_override,
       p.max_whatsapp_instances AS plan_max_wa,
       p.name AS plan_name
FROM tenants t
JOIN plans p ON p.id = t.plan_id
WHERE p.plan_type = 'custom'
  AND t.max_whatsapp_instances_override IS NULL
  AND p.max_whatsapp_instances IS NULL
ORDER BY t.name;
```

Definir override em Super Admin → Limites (mín. = uso atual) antes de WC2/extras no Meu Plano.
