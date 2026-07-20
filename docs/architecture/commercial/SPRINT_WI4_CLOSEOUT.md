# Sprint WI4 CLOSEOUT — Renovação e polimento (conexões WhatsApp)

| Campo | Valor |
|-------|--------|
| **Sprint** | WI4 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint 4) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) |
| **Próxima** | — (série WI concluída) |

---

## Veredito

Renovação SaaS passa a somar extras de conexões WhatsApp; downgrade agendável no próximo ciclo; SA e docs alinhados. Série WI1–WI4 fechada.

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Renew | `executeSaasRenewal` + `computeWhatsAppInstanceRenewalExtrasCents` |
| Preço unitário | snapshot `contracted_price_per_instance_cents` ou catálogo |
| Schedule | migration `295` + `PUT /instances/schedule-next-cycle` + UI Meu Plano |
| Activate | limpa schedule ao pagar `instance_addon` |
| SA | texto de usage em `SuperAdminClientLimites` |
| Docs | `PLANO-PLANOS-PERSONALIZADOS-E-PADRAO.md` + closeouts |
| Testes | `billingService.whatsappRenewalExtras.test.ts` |

---

## Fórmula de renovação

```
amount = renew_plano_ou_assentos
       + max(0, contracted − plan.max_whatsapp_instances) × unit_price
```

`contracted` = schedule ?? override ?? plan.max · ilimitado / sem preço → extras = 0

---

## Critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| Renovação não esquece extras | **Pass** |
| Schedule redução | **Pass** |
| Mensagens unificadas (limite → Meu Plano) | **Pass** |
| Closeout documentado | **Pass** |

---

## Ops

Aplicar migrations **293**, **294** e **295** no ambiente.
