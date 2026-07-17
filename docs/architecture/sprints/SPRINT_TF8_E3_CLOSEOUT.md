# SPRINT_TF8_E3_CLOSEOUT — Cap warmup de mensagens

| Campo | Valor |
|---|---|
| **Sprint** | TF8 · Etapa 3 |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Plano** | [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md) |
| **Data** | 2026-07-16 |
| **Comando** | `ok etapa 3` |

---

## Resumo

Warmup de `/messages` cai de **5** para **2** (selected + 0–1). A conversa **selecionada** não é GET pelo prefetch (open pipeline é o dono). Skip se msgs já no Store. Agenda após **rAF×2 + idle** para não competir com first paint.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `DEFAULT_WARM_CONVERSATION_COUNT` | **5 → 2** |
| Skip selected | `runQueue` não chama `load` para `selectedId` |
| Skip Store | `isConversationAlreadyWarm` (já existia) |
| Idle / paint | rAF×2 → `scheduleIdleTask` (timeout 5s / fallback 1.6s) |
| Engine capacity | Recria singleton se capacity mudar |
| Testes | `store.tf8.e3-warmup-cap.test.ts` (4) |

---

## Comportamento esperado no F5

```
1. Open da selecionada → 1× GET messages (pipeline normal)
2. Warmup idle → ≤1 GET vizinho (se cold e na fila de 2)
3. Total warmup GETs ≤ 2; tipicamente 0–1 além do open
```

---

## Checklist manual

1. Abrir `/chat` com conversa selecionada.  
2. Network: **≤2** GETs `.../messages?limit=50&latest=1` de warmup (+ 1 do open se aplicável).  
3. Trocar de conversa → open intacto (mensagens carregam).  
4. Antes: ~5 GETs em sequência; agora ≤2.

---

## Próximo

**`ok etapa 4`** — shell polls coalesce + bubble parity.
