# Sprint WR2 CLOSEOUT — Routing por módulo

| Campo | Valor |
|-------|--------|
| **Sprint** | WR2 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint 2) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md](./PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |
| **Próxima** | WR3 — sticky / badges / polimento (`DONE`) |

---

## Veredito

Módulos do catálogo (agenda, propostas, contratos, …) têm tick dedicado. Faturas permanecem em `purpose=invoice`. Sem tick → fallback heurístico.

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Resolve | `resolveWhatsAppRoutingForEventKey` (invoice + module) |
| Set | `setInstanceModuleRouting` (unicidade por tenant+module) |
| Wire | business + appointment + outbound retry |
| API/UI | modules no purpose-routing + switches |
| Testes | `whatsappInstanceRoutingService.test.ts` |

---

## Aceite

| Critério | Status |
|----------|--------|
| Agenda usa instância marcada | **Pass** |
| Módulo sem tick → fallback | **Pass** |
| Invoice isolado | **Pass** |

---

## Ops

Nenhuma migration nova (schema WR1 já cobre `purpose=module`).
