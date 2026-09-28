# SPRINT_6_CLOSEOUT — Phase 11 · Legacy Retirement Prep

| Campo | Valor |
|---|---|
| **Sprint** | 6 |
| **Phase** | 11 |
| **Gate** | **CLOSED** (declaração + prep — **não** purge físico) |
| **Data** | 2026-07-15 |
| **Tipo** | Architecture declaration + FE precedence helper |
| **Backend / SQL / Redis / Socket / Workers / Flags catalog** | **Não alterados** |

---

## Veredito

**Domain Store = Runtime Core** do Chat/Floating quando `CHAT_CORE_STORE=ON` (ADR-013).  
Dual-path Store OFF permanece **ROLLBACK** até **MB-028** (após canário Store ON estável).  
**Nenhuma** remoção física de legado nesta sprint.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| ADR-013 | `docs/architecture/chat/ADR-013-DOMAIN-STORE-RUNTIME-CORE.md` |
| Checklist MB-028 | `PHASE11_LEGACY_RETIREMENT.md` |
| `cachePrecedence.ts` | Alias meta + `isChatStoreOffLegacyPathActive` + docs Phase 11 |
| Float meta hook | Usa `shouldReactQueryOwnConversationMeta` |
| Tracker / status / README | Phase 11 prep registrado |
| Testes | `store.phase11.cache-precedence.test.ts` |

### Critério de aceite (ajustado ao canário)

| Critério (plano original) | Status Sprint 6 |
|---|---|
| Declarar Domain Store = Runtime Core | **Pass** (ADR-013) |
| Inventário / isolar path OFF | **Pass** (checklist + ROLLBACK) |
| Remover bridges / dual-path | **Defer → MB-028** |
| Não inventar Runtime Core paralelo | **Pass** |
| Flags catalog defaults | **Intocado** |

---

## Observações (não corrigidas)

1. **Canário Store ON em DEP/prod** ainda não é pré-requisito comprovado neste closeout — usuário avançou Sprint 6 sob confirmação; delete físico continua bloqueado.  
2. **Dual-path Store OFF** (Chat `useState`, Float RQ lista/messages/meta, `tryApplyChatWsPatch`) permanece no código de propósito.  
3. **`CHAT_CORE_STORE` default OFF** no painel — operacionalmente Runtime Core só vive em ambientes com flag ON.  
4. **Kanban** fora do Runtime Core (Sprint 5 A) — não mudou.  
5. **WS Float ainda pode tocar RQ** em Store OFF; Store ON já early-return no Provider (pré-existente).  
6. **ClientProfile / superfícies satélite** não fazem parte deste Runtime Core declaration.

---

## Artefatos

| Arquivo | |
|---|---|
| `SPRINT_6_PHASE11.md` | Spec |
| `SPRINT_6_CLOSEOUT.md` | Este |
| `PHASE11_LEGACY_RETIREMENT.md` | Checklist MB-028 |
| `ADR-013-DOMAIN-STORE-RUNTIME-CORE.md` | ADR |

---

## Ownership Closure — status do plano

Sprints **1–6 CLOSED**.  
Próximo trabalho operacional fora deste plano: **canário Store ON → MB-028** remoção física dedicada.
