# STATIC_DEPENDENCY_REPORT — F6.8

| Campo | Valor |
|---|---|
| **Documento** | STATIC_DEPENDENCY_REPORT |
| **Data** | 2026-07-13 |
| **Sprint** | F6.8 |
| **Escopo** | `src/features/chat-core/**` (+ referências UI) |
| **Remoções** | **Nenhuma** (só catálogo) |

---

## 1. Resumo

| Categoria | Achados | Ação F6.8 |
|---|---|---|
| TODO / FIXME / HACK | **0** matches explícitos em `chat-core` | — |
| `console.*` | Presente em **métricas gated** + hydration audit DEV | Manter (DEV only) |
| Shadow / compat / legacy lexical | Alto volume (nomes históricos F0–F5) | Catalogar — não apagar |
| Actions reservadas | `ui/patch`, `messages/evictPage` | Documentado DOMAIN_STORE_FREEZE |
| Contract drift tipagem F0 | `ChatCoreCommandHandlers` incompleto vs namespace | Documentado PUBLIC_API_FREEZE |
| Instrumentação antiga | `commandShadowValidation`, `chatShadowValidation`, `shadowLog` | ROLLBACK / DEBT |
| WS-patch | Ativo STORE OFF; bypass STORE ON | ROLLBACK |
| Floating dump | `latestPage: false` | ROLLBACK residual |
| Suite | **202** store tests verdes | ✅ |

---

## 2. Console / telemetria

Arquivos com `console` / logs de métricas (amostra):

- `metrics/*` — gated `isChatPerformanceTelemetryEnabled()`
- `store/f5HydrationAudit.ts` — DEV audit
- `store/shadowLog.ts`, `commandShadowValidation.ts` — shadow histórico
- `realtime/bridge.ts` — diag pontual

**Produção:** com `CHAT_CORE_METRICS=OFF` e build prod, coleta performance **não roda** (gate DEV \|\| test).

---

## 3. Shadow / compat wrappers (não remover)

| Artefato | Papel |
|---|---|
| `store/commandShadowValidation.ts` | Validação shadow antiga |
| `store/chatShadowValidation.ts` | Idem |
| `store/shadowLog.ts` | Logs shadow |
| `ws-patch/*` | RQ patch F2 |
| `core/chatCommandBridge.ts` | Bifurca STORE ON/OFF |
| `domain/adapters.ts` | Mapeamentos legado |
| `realtime` legacy event names | `CHAT_WS_EVENTS_LEGACY` |

Classificação freeze: **ROLLBACK** até canário.

---

## 4. Exports / barrels

| Barrel | Status |
|---|---|
| `features/chat-core/index.ts` | Público módulo — manter |
| `store/public.ts` | **API UI oficial** — freeze |
| `store/index.ts` | Testes + re-exports amplos — OK |
| `prefetch/index.ts` | F6.6 — OK |
| `virtualization` barrel | F6.3/F6.4 — OK |

Dead export audit exhaustivo automatizado **não** executado (sem depcruise nesta sprint). Órfãos de action catalogados manualmente.

---

## 5. Duplicações conscientes

| Par | Nota |
|---|---|
| `ChatCoreCommands` vs `chatCoreCommands` | F0 naming vs F5 handlers |
| `markAsReadCommand` vs `markConversationRead` | Alias |
| Message virt `core` vs `legacy` | Dual engine intencional |
| Floating dump vs Chat pages | Intencional até Float pages sprint |

---

## 6. Performance freeze

| Check | Status |
|---|---|
| Novas medições pendentes de implementação | ❌ — F6.7 template live fill é **operacional**, não código |
| Telemetria DEV-only | ✅ |
| `CHAT_CORE_METRICS` gated | ✅ |
| Métricas em produção (default) | ✅ **off** |

---

## 7. Dívida recomendada (pós-freeze / não F6.8)

1. Alinhar `ChatCoreCommandHandlers` ao namespace (tipagem only).  
2. Remover ou criar creator para `ui/patch`.  
3. Float → latest page + Load More.  
4. Depurar shadow validation morto após canário F5.  
5. Eliminar stub `CHAT_INBOX_CURSOR`.  

**Nenhum item acima executado nesta sprint.**
