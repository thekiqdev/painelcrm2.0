# SPRINT_TF7_CLOSEOUT — Warm Store + TTL + force sync (global)

| Campo | Valor |
|---|---|
| **Sprint** | TF7 (E1–E4) |
| **Gate** | **CLOSED** (aguardando QA unificado) |
| **Plano** | [`PLAN_TF7_WARM_STORE_CACHE.md`](./PLAN_TF7_WARM_STORE_CACHE.md) |
| **Auditoria** | [`AUDIT_TF7_WARM_STORE_CACHE.md`](./AUDIT_TF7_WARM_STORE_CACHE.md) |
| **Data** | 2026-07-16 |

---

## Etapas entregues

| Etapa | Closeout | Entrega |
|---|---|---|
| **E1** | [`SPRINT_TF7_E1_CLOSEOUT.md`](./SPRINT_TF7_E1_CLOSEOUT.md) | Warm Domain Store do `chatPageCache` |
| **E2** | [`SPRINT_TF7_E2_CLOSEOUT.md`](./SPRINT_TF7_E2_CLOSEOUT.md) | TTL 5 min (WS up) / 30 s (down) + skip GET |
| **E3** | [`SPRINT_TF7_E3_CLOSEOUT.md`](./SPRINT_TF7_E3_CLOSEOUT.md) | Espelho WS/GET → disk + UI force/clear |
| **E4** | [`SPRINT_TF7_E4_CLOSEOUT.md`](./SPRINT_TF7_E4_CLOSEOUT.md) | Float parity + diag + cap 50 |

---

## Modelo final

```
Abrir /chat ou Float
  → warm do localStorage → Domain Store (E1/E4)
  → se fresco (E2) → sem GET lista
  → WS patches → Store + espelho disk (E3)
  → “Atualizar” / limpar cache → force GET (E3/E4)
```

---

## Checklist QA unificado

1. Cache frio → 1 GET → lista OK → cache gravado.  
2. F5 imediato (WS up) → paint warm → **sem** GET se dentro do FRESH_TTL.  
3. Msg WhatsApp → preview via WS; espelho no disk; F5 mantém preview.  
4. “Atualizar lista” (Chat ou Float) → GET mesmo dentro do TTL.  
5. “Limpar cache e atualizar” (Chat) → storage limpo + GET.  
6. Trocar filtros → sem warm cruzado.  
7. Float com Chat aberto → sem 2º GET lista.  
8. DEV: logs `[inbox-cache] inbox_warm_hit` / `inbox_fetch_skipped_fresh`.

---

## OOS / follow-ups

- TF8: `operations-dashboard` dedupe  
- MB-028: remoção Store OFF  
