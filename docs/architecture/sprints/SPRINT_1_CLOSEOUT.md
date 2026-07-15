# SPRINT_1_CLOSEOUT — Phase 10F · Instance Visibility Unification

| Campo | Valor |
|---|---|
| **Sprint** | 1 |
| **Phase** | 10F |
| **Gate** | **CLOSED** |
| **Data** | 2026-07-15 |
| **Tipo** | Frontend Runtime Hardening |
| **Backend / SQL / Redis / Socket / Workers / Flags / ADR** | **Não alterados** |

---

## Veredito

Chat e Floating passam a resolver **enabled instance IDs de inbox** a partir do mesmo snapshot (`refreshInboxInstanceVisibility` / `useInboxInstanceVisibility`).  
Toggle de enable no Chat usa `force: true` (invalida registry + refetch) e notifica o Floating via subscribe.

---

## O que foi feito

### Runtime compartilhado

| Item | Detalhe |
|---|---|
| `instance-registry/inboxVisibility.ts` | Snapshot `instances` + `enabledInstanceIds` (sorted) + subscribe + refresh coalesced |
| `useInboxInstanceVisibility.ts` | Hook `useSyncExternalStore` |
| Helper único | `filterEnabledChatInstanceIds`; `pickEnabledChatInstanceIds` no Chat **delega** ao canônico |
| Exports | `chat-core/runtime` + `instance-registry` |

### Wiring UI

| Superfície | Mudança |
|---|---|
| `FloatingChatProvider` | Remove `useState(instanceIds)` próprio; lê snapshot; `refreshInboxInstanceVisibility` |
| `Chat.tsx` | `loadInstances` → `refreshInboxInstanceVisibility`; subscribe ao snapshot; toggle → `force: true` |
| Connected picker | Intact — `FloatingConversationWindow` continua `filterConnectedChatInstances` |

### Testes

- `inboxVisibility.test.ts` — Pass (4)
- `chat-core.f3.test.ts` — Pass

### Critério de aceite

| Critério | Status |
|---|---|
| Mesmo critério enabled para inbox Chat/Float | **Pass** |
| Connected não entra no filtro de lista | **Pass** |
| Refresh após toggle sincroniza snapshot compartilhado | **Pass** |
| Sem Backend / Flags / ADR | **Pass** |

---

## Observações (não corrigidas)

> Regra do plano: fora de escopo → apenas documentar.

1. **Chat ainda espelha o snapshot em `useState(instances)` / `enabledInstanceIds`**  
   Cópias locais para a UI da página; a SoT de IDs de inbox é o snapshot, mas não removemos o espelho (risco de regressão na página grande). Unificação mais profunda (Chat ler só o hook) pode ser polish futuro — **não feito**.

2. **`ClientProfile` (e possivelmente Lead dialogs) ainda chamam `ensureChatInstances` + filtro local**  
   Não passam pelo snapshot de inbox visibility. Se abrirem listas em paralelo com Chat/Float, teoricamente ainda podem divergir. **Fora do escopo Sprint 1** (só Chat↔Floating).

3. **Float header `conversation-meta` RQ**  
   Continua paralelo (Sprint 2). Sem relação com Instance, mas segue como residual 10C.

4. **Registry fresk (2 min) sem `force`**  
   Mitigado no toggle Chat com `force: true`. Outros callers de `ensureChatInstances({ reason: 'bootstrap' })` sem force ainda podem ler cache registry stale se metadata mudou por outro path — observado; não generalizado um “invalidate on all mutations” além do toggle Chat.

5. **Kanban / Store OFF**  
   Inalterados (Sprints 5–6).

6. **`resetInboxInstanceVisibility` no logout do Float**  
   Nome limpo para produção; alias `ForTests` mantido. Bootstrap/logout global do F3 não foi obrigatoriamente amarrado a este reset em todos os exits de sessão — se houver race pós-logout, observar em canário.

---

## Artefatos

| Arquivo | |
|---|---|
| `SPRINT_1_INSTANCE_VISIBILITY.md` | Spec |
| `SPRINT_1_CLOSEOUT.md` | Este |

---

## Próximo

Conforme `PLAN_RUNTIME_OWNERSHIP_CLOSURE.md`:

```
ok sprint 2
```

→ Phase 10E · Float Header / Meta Ownership
