# Billing 2.0 — Sprint 1 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 1 — Foundation |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |

## Entregáveis

| Item | Status |
|------|--------|
| Tipos CollectionPolicy / Event / Action | ✅ |
| Defaults = fluxo atual + PRD §18 | ✅ |
| Serialize/deserialize estável | ✅ |
| Reader em memória (+ grace settings) | ✅ |
| Interpretador noop | ✅ |
| Hooks renew + webhook paid (flag OFF) | ✅ |
| Doc Event → Action | ✅ |
| Migrations / UI / dunning real | ❌ fora de escopo |

## Critérios de aceite

- [x] Round-trip serialize/deserialize
- [x] Defaults destrutivos OFF
- [x] Extension points sem efeito observável (flag OFF)
- [ ] QA regressão renovação/checkout (operador)

## Rollback

Revert do PR; zero schema.
