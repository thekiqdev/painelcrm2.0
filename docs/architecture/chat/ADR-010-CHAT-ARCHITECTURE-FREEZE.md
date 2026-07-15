# ADR-010 — Chat Architecture Freeze (F1–F6)

| Campo | Valor |
|---|---|
| **ADR** | ADR-010 |
| **Título** | Chat Enterprise Architecture Freeze |
| **Data** | 2026-07-13 |
| **Status** | **Accepted** |
| **Sprint** | F6.8 |
| **Supersede** | — |
| **Relacionados** | AUDIT_F5_FINAL, AUDIT_F6, F7_READINESS_REPORT, Master Plan §F0–F7 |

---

## Contexto

Entre F1 e F6 o Chat migrou de multi-socket / RQ-as-SoT / N+1 HTTP para:

- Socket Bridge único (F1)
- Domain Store SoT (F5)
- Cursor + Window Cache + Virtualização + Render opt + Warm Prefetch (F6)

A F7 exige Redis / multi-réplica. Sem freeze, há risco de misturar mudanças estruturais de frontend com infra distribuída.

---

## Decisão

1. **Congelar** Chat Core, Domain Store, Commands, Repository, Realtime Bridge, Cursor Engine, Window Cache, Virtualization engines, Performance Layer e Public Hooks.
2. Toda mudança nessas camadas **exige ADR** + revisão de rollback flags.
3. F7 evolui **apenas** infraestrutura realtime distribuída (adapter, fan-out, HA) **sobre** contratos existentes.
4. Legado dual-path permanece classificado (ROLLBACK / DEPRECATED / REMOVE_READY) — **sem remoção física** neste ADR.
5. Telemetria permanece **DEV + `CHAT_CORE_METRICS`**.

Documentos oficiais do freeze:

- `F6_ARCHITECTURE_FREEZE_REPORT.md`
- `PUBLIC_API_FREEZE.md`
- `DOMAIN_STORE_FREEZE.md`
- `FEATURE_FLAGS_AUDIT.md`
- `STATIC_DEPENDENCY_REPORT.md`
- `DEPENDENCY_GRAPH.md`

---

## Alternativas descartadas

| Alternativa | Motivo do descarte |
|---|---|
| Remover legado agora | Canário production incompleto; tracker `Removido=0` |
| Reabrir Store schema na F7 | Mistura preocupações; risco regressão UX |
| Unificar Floating dump na F6.8 | Escopo feature; fora de freeze |
| Telemetria em produção | Custo/ruído; gate DEV é suficiente |
| Nova SoT paralelo (RQ+Store) | Invertido na F5.6 — proibido |

---

## Consequências

### Positivas

- Fronteira clara para F7
- Contratos auditáveis
- Reduz churn estrutural
- Facilita remoção futura do legado

### Negativas / limitações

- Drift tipagem F0 vs `chatCoreCommands` permanece até PR tipagem
- Floating full dump residual
- Órfãos `ui/patch` / eviction API interna
- Flags stub `CHAT_INBOX_CURSOR` / `CHAT_REDIS_WS`

### Futuro permitido sem violar freeze

- Implementar `CHAT_REDIS_WS` + adapter (F7)
- PRs de remoção de código `REMOVE_READY` após canário
- Fill baseline live (ops)
- Float pages sprint (feature ADR próprio)
- Correções de bug **sem** mudar contratos públicos

---

## Pipelines oficiais (invariantes)

```text
HTTP:      Repository → Commands → Store → Selectors → Hooks → UI
Realtime:  Socket → Bridge → Store → Hooks → UI
UI writes: Commands (nunca patch Store direto na UI)
```

Bypass STORE ON = incidente / regressão.

---

## Aceite

| Critério | Status |
|---|---|
| ADR publicada | ✅ |
| Freeze report publicado | ✅ |
| Suite store verde (202) | ✅ |
| F7 desbloqueada sobre freeze | ✅ |
