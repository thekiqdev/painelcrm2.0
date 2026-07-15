# PHASE5_QA_REPORT

| Caso | Resultado |
|---|---|
| Unit Phase 5 + F5.3 floating | ✓ 17 passed |
| `check:chat-sot-guards` | ✓ |
| ADR-011 criado | ✓ |
| Login…Realtime (browser) | ⚠ smoke pendente (API offline) |
| Floating latest-page + Load More | código OK; smoke Store ON |
| ClientProfile F1 bridge | path existente + telemetry |
| Multi-tab / Send / Receive | sem mudança protocolo |
| Regressão contratos públicos | nenhuma (comando `loadMessages` intacto) |

**Não regressão estrutural:** legado OFF paths preservados; dump via `VITE_FLOAT_MESSAGES_DUMP=1`.
