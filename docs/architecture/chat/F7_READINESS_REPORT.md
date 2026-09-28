# F7_READINESS_REPORT — Liberação oficial pós F6.7

| Campo | Valor |
|---|---|
| **Documento** | F7_READINESS_REPORT |
| **Data** | 2026-07-13 |
| **Fase liberada** | **F7 — Escala horizontal WebSocket (Redis adapter)** |
| **Pré-requisito** | F6 certificado — [`AUDIT_F6_PERFORMANCE_CERTIFICATION.md`](./AUDIT_F6_PERFORMANCE_CERTIFICATION.md) |
| **Plano mestre** | [`CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md`](../CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md) §F7 |
| **Código F7 nesta sprint** | **Nenhum** (somente liberação) |

---

## Veredito

### **F7 oficialmente liberada para início**

Não há bloqueio arquitetural remanescente da F6 que impeça começar o desenho e implementação do adapter Redis / multi-réplica Socket.IO.

| Pré-requisito Master Plan | Status |
|---|---|
| F1 Single Socket (Bridge) | ✅ Entregue (flag; default OFF em catalog) |
| Tráfego HTTP estabilizado (F2–F4 recomendado) | ✅ Agregado + store paths existem (flags) |
| F5 Domain Store SoT | ✅ Certificado AUDIT_F5 |
| F6 cursor / virt / cache / prefetch | ✅ F6.0–F6.6 + AUDIT_F6 |
| Redis HA + runbooks | ⏳ **Ops — fora do código chat-core** |
| `CHAT_REDIS_WS` implementação | ❌ Stub (`false`); trabalho F7 |

---

## Escopo F7 (Master Plan)

| | |
|---|---|
| **Objetivo** | Multi-réplica Node com fan-out WS consistente (`@socket.io/redis-adapter` ou equivalente) |
| **Aceite** | ≥2 réplicas; mensagem entregue cross-node; dashboards de sockets |
| **Rollback** | 1 réplica + sticky; adapter off |
| **Tracker** | L-RT-08 (adapter ausente), L-FF-14 (`CHAT_REDIS_WS`), L-RT-06 (eventos legacy) |

---

## O que a F6 já entrega para a F7

| Capacidade | Por quê importa na F7 |
|---|---|
| Um Bridge / política realtime store | Menos writers concorrentes ao fan-out |
| Batch dispatch + stable UI | Burst cross-node menos custoso no cliente |
| HTTP idle baixo (agregado + store) | Menos pressão no LB enquanto WS escala |
| Window cache + virt | Memória cliente bounded sob CCU alto |
| Telemetria socket/HTTP | Medir regressão durante rollout Redis |

---

## Gaps explícitos (não bloqueiam *iniciar* F7)

1. **Redis HA / conexão** — infraestrutura e secrets não existem no módulo chat-core.
2. **Multi-réplica certificação** — requer ambiente ≥2 nodes (fora desta auditoria).
3. **Eventos WS legacy (L-RT-06)** — dual support até backend só v2.
4. **Baseline live F6** — células `?` em [`PERFORMANCE_BASELINE_F6.md`](./PERFORMANCE_BASELINE_F6.md); podem correr em paralelo ao kickoff F7.
5. **Floating dump residual** — não bloqueia Redis; tratar em sprint Float pages.
6. **Remoção física legado UI** — **não** é pré-requisito de F7 (Master Plan: F7 após F1; recomendado pós F2–F4).

---

## Gate de liberação (checklist)

| # | Item | Status |
|---|---|---|
| 1 | AUDIT_F6 emitido | ✅ |
| 2 | Suite store verde (202) | ✅ |
| 3 | Phase código F6.6 | ✅ |
| 4 | LEGACY_REMOVAL_READINESS emitido | ✅ |
| 5 | PERFORMANCE_BASELINE_F6 emitido | ✅ |
| 6 | Redis HA provisionado | ⏳ Ops |
| 7 | ADR adapter + feature flag wiring | ⏳ Sprint F7.0 |
| 8 | Canário 2 réplicas | ⏳ Sprint F7 |

**Liberação de engenharia:** ✅ **GO**  
**Liberação de produção multi-host:** ⏳ após itens 6–8

---

## Primeira sprint F7 sugerida (não executada aqui)

1. ADR: `@socket.io/redis-adapter` vs alternativa; sticky fallback.
2. Wiring `CHAT_REDIS_WS` no catalog (hoje stub sempre false).
3. Health metrics: sockets por node, pub/sub lag.
4. Teste: publish em node A → receive em node B.
5. Atualizar `LEGACY_REMOVAL_TRACKER` L-RT-08 / L-FF-14.

---

## Proibido (Master Plan)

| Proibido | Motivo |
|---|---|
| Multi-réplica WS **sem** adapter | Miss de eventos cross-node |
| Claim de 5k–10k CCU multi-host sem F7 | AUDIT_CHAT_SCALE_READINESS |
| Remover Bridge single-socket path antes de F7 estável | Rollback |

---

## Pós F6.8

Arquitetura F1–F6 **congelada** ([`ADR-010-CHAT-ARCHITECTURE-FREEZE.md`](./ADR-010-CHAT-ARCHITECTURE-FREEZE.md)). F7 foca exclusivamente em infra distribuída.

## Assinatura

| Campo | Valor |
|---|---|
| **F7 liberada?** | **Sim** (início de engenharia) |
| **Assinado por** | Sprint F6.7 + confirmado F6.8 Architecture Freeze |
| **Dependência restante** | Redis HA / runbooks (ops) |
