# ADR-013 — Domain Store as Chat Runtime Core

| Campo | Valor |
|---|---|
| **ADR** | ADR-013 |
| **Título** | Domain Store = Runtime Core do Chat / Floating |
| **Data** | 2026-07-15 |
| **Status** | **Accepted** |
| **Sprint** | Phase 11 / Sprint 6 (Ownership Closure) |
| **Relacionados** | ADR-010, ADR-011, Phase 10A–10D, Sprints 1–5, MB-028 |

---

## Contexto

Após Phases 9–10D e Sprints 1–5 do plano `PLAN_RUNTIME_OWNERSHIP_CLOSURE`:

- Instance visibility unificada (10F)
- Float header/meta na Store (10E)
- Open pipeline coalescido (10G)
- CRM detail = projeção do vínculo Store (10H)
- Kanban = residual oficial Opção A (10K-GATE)
- Preview ← Messages hydrated (10D)

O Domain Store, com `CHAT_CORE_STORE=ON`, já é a SoT operacional de Conversation/Messages para Chat e Floating. Persistia ambiguidade documental se existiria um “Runtime Core” paralelo.

---

## Decisão

1. **O Chat Domain Store é o Runtime Core** de Conversation + Messages (e Preview derivado hydrated) para superfícies Chat e Floating quando `CHAT_CORE_STORE=ON`.
2. **Não** se cria camada Runtime Core adicional.
3. React Query / `useState` locais / IndexedDB são:
   - **satellite / warm / rollback** com Store ON, ou  
   - **path primário legado** somente com Store OFF (coexistência).
4. **Kanban board** permanece **fora** deste Runtime Core (Sprint 5 Opção A).
5. **Remoção física** do dual-path Store OFF = **MB-028**, somente após canário Store ON estável — **não** nesta ADR.
6. Catalog de Feature Flags **não** muda defaults neste ADR (ADR-010 / freeze de flags).

---

## Pipeline oficial (Store ON)

```
Instance Visibility (shared snapshot)
        │
        ▼
Conversation Store  ←── CRM link SoT / header / lista
        │
        ▼
Message Store  ←── open coalesced loadMessagesCommand
        │
        ▼
Preview sync (10D, when hydrated)
        │
        ▼
Selectors → Chat / Floating
```

CRM profile GET = **projeção** (Sprint 4).  
Kanban `conv_*` = **projeção de board** (Sprint 5 A).

---

## Consequências

### Positivas

- Fronteira clara pós-Ownership Closure
- MB-028 pode deletar legado com inventário já classificado
- Evita reinventar “Phase 11 Runtime Core” monolítico

### Negativas / custos

- Dual-path Store OFF continua no código até MB-028
- Ambientes com flag OFF não vivem o Runtime Core completo

---

## Compliance

| Contrato | Relação |
|---|---|
| ADR-010 | Respeitado — sem remoção física; sem novo schema Store |
| ADR-011 | Respeitado — latest-page permanece |
| DOMAIN_STORE_FREEZE | Respeitado — contrato tipado público intocado |
| MB-028 | Sucessor para delete físico |

---

## Assinatura

| | |
|---|---|
| ADR-013 | **Accepted** |
| Physical legacy delete | **Deferred → MB-028** |
