# PERFORMANCE_BASELINE_F6 — Comparativo F5.12 × F6

| Campo | Valor |
|---|---|
| **Documento** | PERFORMANCE_BASELINE_F6 |
| **Tipo** | Baseline de certificação (auditoria) |
| **Data** | 2026-07-13 |
| **Referência F5** | [`SPRINT_F5.12_PERFORMANCE_BASELINE_REPORT.md`](./SPRINT_F5.12_PERFORMANCE_BASELINE_REPORT.md) |
| **Certificação** | [`AUDIT_F6_PERFORMANCE_CERTIFICATION.md`](./AUDIT_F6_PERFORMANCE_CERTIFICATION.md) |
| **Código alterado** | **Nenhum** (F6.7 audit-only) |

---

## 1. Como ler esta baseline

| Coluna | Significado |
|---|---|
| **F5.12 (estático)** | Expectativa documentada na F5.12 / AUDIT F5 (células `?` nunca preenchidas em runtime no repo) |
| **F6 (design)** | Alvo arquitetural após F6.0–F6.6 |
| **F6 (live)** | Preencher em staging com Network + getters DEV |

Gate de telemetria (inalterado):

```text
(import.meta.env.DEV || MODE === 'test') && CHAT_CORE_METRICS === true
```

Flags de corrida: `CHAT_CORE_STORE=ON`, `CHAT_SINGLE_SOCKET=ON`, Aggregated ON.

---

## 2. Comparativo executivo

| Dimensão | F5.12 (pré-F6) | F6.6 (pós) | Delta esperado |
|---|---|---|---|
| SoT | Domain Store | Domain Store + engines F6 | Estável |
| Abrir `/chat` HTTP | ~3–4 | ≤4 | ≈ 0 |
| Abrir conversa HTTP | +1 (+ sync optional) | ≤1 messages (+ sync) | ≈ 0 / prefetch miss↓ |
| HTTP após WS | 0 (design) | 0 (batch + store) | Estável / prove Network |
| DOM lista conversas | O(N) rows | O(viewport+overscan) F6.3 | ↓ grande N |
| DOM thread | O(N) / TanStack só se limiar | O(viewport) core F6.4 | ↓ grande N |
| Re-render WS burst | Notify amplo | `dispatchBatch` + stable selectors F6.5 | ↓ 50–80% (claim F6.5) |
| Memória mensagens | Cresce com dump | Window ~5 páginas F6.2 | Bound residente |
| Troca conversa frequente | Sempre HTTP | Warm/prefetch F6.6 | Hit sem HTTP perceptível |
| Suite store | 118 | **202** | +84 testes F6 |

---

## 3. Targets F6.7 (expected_metrics)

| Métrica | Alvo | Fonte de prova | Status auditoria |
|---|---|---|---|
| `http_open_chat` | ≤ 4 | Network + `getHttpMetricsSnapshot` / cenário `chat_open` | ✅ Design F5.12; **live = ?** |
| `http_open_conversation` | ≤ 1 | Network + cenário `conversation_open` | ✅ Design; sync pode +1; **live = ?** |
| `http_after_ws` | 0 | Network durante burst + `incoming_message` | ✅ Design Bridge; **live = ?** |
| `constant_dom` | true | Virt metrics + Elements (node count estável no scroll) | ✅ Codigo; **live = ?** |
| `constant_memory` | true | Window eviction + `memoryMetrics` | ✅ Proxy; heap browser **?** |
| `virtualization_enabled` | true | F6.3/F6.4 + hooks Chat | ✅ |
| `window_cache_enabled` | true | F6.2 | ✅ |
| `warm_window_enabled` | true | F6.6 + `useConversationWarmup` | ✅ |

---

## 4. Tabelas de cenário (template fill)

### 4.1 `chat_open`

| Métrica | F5.12 baseline | F6 alvo | F6 live |
|---|---|---|---|
| http_requests | ~3–4 (estático) / `?` live | ≤ 4 | ? |
| reducers | ? | ≤ F5.12 | ? |
| selectors | ? | ≤ F5.12 (virt↓ work UI) | ? |
| subscriptions | ? | ≤ F5.12 + skips F6.5 | ? |
| renders | ? | ↓ vs F5.12 | ? |
| mount_ms | ? | ≤ F5.12 | ? |

### 4.2 `conversation_open`

| Métrica | F5.12 baseline | F6 alvo | F6 live |
|---|---|---|---|
| http_requests | +1 (+ sync?) | ≤ 1 (+ sync classificado) / 0 se warm hit | ? |
| warm_window_hit | n/a | ↑ após idle | ? |
| prefetch_miss | n/a | primeiro open frio | ? |
| load_ms | ? | ≤ F5.12; ≪ em hit | ? |
| message_dom_nodes | O(N) / limiar | O(viewport+overscan) | ? |

### 4.3 `incoming_message` (WS)

| Métrica | F5.12 baseline | F6 alvo | F6 live |
|---|---|---|---|
| http_requests | 0 | 0 | ? |
| reducers | ≈ 1–2 | ≈ 1–2 + batch em burst | ? |
| batchedDispatches | n/a | ↑ efficiency F6.5 | ? |
| row_renders | ? | 1 mensagem (memo) | ? |
| socket_apply_ms | ? | ≤ F5.12 | ? |

### 4.4 Window Cache / Warm Window

| Métrica | Getter | F6 alvo | F6 live |
|---|---|---|---|
| resident pages / conversation | `getWindowMetricsSnapshot` | ~≤ 5 | ? |
| evictions under load | idem | > 0 em stress | ? |
| prefetch hit rate | `getPrefetchMetricsSnapshot` | ↑ com idle | ? |
| prefetch cancel on interact | idem | > 0 se scroll agressivo | ? |

### 4.5 Memória (heurística F5.12 — inalterada)

| Cenário | Bytes estimados |
|---|---|
| 100 conversas | 80 000 |
| 500 conversas | 400 000 |
| 1000 conversas | 800 000 |
| 5000 mensagens (sem window) | 2 000 000 |
| Com Window Cache | Bound ≈ pages × pageSize × 400 B |

---

## 5. API de coleta (DEV)

```ts
import {
  getChatPerformanceReport,
  logChatPerformanceReport,
  resetChatPerformanceMetrics,
  beginPerfScenario,
  endPerfScenario,
  getHttpMetricsSnapshot,
  getSocketMetricsSnapshot,
  getWindowMetricsSnapshot,
  getPrefetchMetricsSnapshot,
  getRenderOptimizationMetricsSnapshot,
  getConversationVirtualizationMetricsSnapshot,
  getMessageVirtualizationMetricsSnapshot,
} from '@/features/chat-core';
```

Nota: `getChatPerformanceReport()` agrega a camada F5.12; getters F6 são **complementares** (chamar em separado nesta certificação).

---

## 6. Regressões

| Área | Regressão funcional detectada na auditoria estática? |
|---|---|
| Commands / Repository / APIs públicas | Não (F6 não alterou contratos) |
| Rollback OFF | Paths dual presentes (Chat/Floating/virt) |
| Suite store | 202 passed — sem falha |
| UX visual | Não medida aqui — checklist operador |

---

## 7. Conclusão baseline

| Afirmação | Status |
|---|---|
| Comparativo F5.12 × F6 documentado | ✅ |
| Targets F6.7 alinhados ao design | ✅ |
| Live Network/Profiler fill | ⏳ Staging (obrigatório para GO pleno prod) |
| Sem regressão estrutural | ✅ |

**Próximo passo operacional:** uma corrida staging preenche as colunas `F6 live` e atualiza este arquivo com números reais (sem mudar código).
