# PHASE6_BENCHMARKS

| Campo | Valor |
|---|---|
| **Phase** | 6 |
| **Data** | 2026-07-14 |
| **Ferramenta bundle** | `npm run build:crm` (Vite) — 2026-07-14 |

---

## LOC

| Artefato | Before | After | Δ |
|---|---:|---:|---:|
| `src/pages/Chat.tsx` | **7829** | **7500** | **-329 (−4.2%)** |
| `src/pages/chat/chatPageHelpers.ts` | — | 247 | +247 |
| `src/pages/chat/ChatHeaderKanbanThreadExtras.tsx` | — | 101 | +101 |
| `src/pages/chat/useChatPageAccess.ts` | — | 108 | +108 |

> Totais de código Chat page+extract ≈ 7956 (helpers+extras+hook+Chat) — o ganho é **organizacional** (menos monólito por ficheiro), não compressão líquida de lógica.

## Componentes

| Métrica | Before | After |
|---|---:|---:|
| Ficheiros em `src/pages/chat/` | 0 | 3 |
| Shell memoizados (Header / Actions / Sidebar chrome / Main / MobileNav) | 3 | 5 |
| Lazy imports commerce/dialog em Chat | 0 | 5 |

## Bundle (Vite `dist/assets`, raw / gzip)

### Chat route chunk

| Chunk | Before (estimado*) | After (medido) |
|---|---:|---:|
| `Chat-*.js` | ~618.8 kB* | **271.20 kB / gzip 61.94 kB** |

\*Before estimado = After Chat + chunks que passaram a async e antes eram sync no grafo do Chat:

| Chunk separado (After) | raw | gzip |
|---|---:|---:|
| `ProposalCreateForm-*.js` | 41.42 | 7.96 |
| `ContractCreateForm-*.js` | 170.54 | 36.84 |
| `CustomerInvoiceNew-*.js` | 117.62 | 20.46 |
| `ChatAppointmentSchedulePanel-*.js` | 18.07 | 3.61 |
| **Soma extraída** | **347.65** | **68.87** |
| Chat After + soma | **618.85** | — |

**Redução no download inicial do Chat (sem abrir commerce):** ~**−347.7 kB raw** (−56% vs estimativa Before).

### App shell / entry

| Chunk | After (medido) |
|---|---:|
| `AppShell-*.js` | 140.89 kB / gzip 31.45 kB |
| `index-CUvjlHg5.js` (main) | 505.95 kB / gzip 123.67 kB |

Rotas de domínio já estavam em `lazyWithReload` (sem mudança de rotas nesta Phase).

## Renders / long tasks / mount time

| Métrica | Before | After | Nota |
|---|---|---|---|
| Renders Header/Sidebar/Nav | — | — | **Não medido** em Profiler nesta sessão; mudanças são `React.memo` + props estáveis (inventory). |
| Long tasks | — | — | **Não medido** (lab browser). |
| Mount time Chat | — | — | **Não medido**; chunk Chat menor implica expectativas de TTI melhores, sem número lab. |

## Lazy imports (contagem código)

| Local | Before | After |
|---|---:|---:|
| Chat commerce/dialogs | 0 sync→eager | **5** `React.lazy` |
| `App.tsx` route lazy | já existia | inalterado |

## Conclusão métrica

- LOC monólito `Chat.tsx` ↓ **329**.
- Chunk Chat inicial ↓ **~348 kB raw** (estimativa vs After medido).
- Renders/long tasks/mount: sem lab — documentado como N/A medido; QA smoke cobre não-regressão UX.
