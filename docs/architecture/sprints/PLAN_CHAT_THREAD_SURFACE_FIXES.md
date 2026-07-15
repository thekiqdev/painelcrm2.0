# PLAN_CHAT_THREAD_SURFACE_FIXES — Pós Ownership Closure

| Campo | Valor |
|---|---|
| **Documento** | Plano incremental de correção de superfície (thread / lista / preview) |
| **Data** | 2026-07-15 |
| **Predecessor** | [`PLAN_RUNTIME_OWNERSHIP_CLOSURE.md`](./PLAN_RUNTIME_OWNERSHIP_CLOSURE.md) — **CLOSED** (sprints 1–6) |
| **Base** | Auditoria pós-teste manual (prints Float vazio · lista contraditória · Chat ≠ preview) |
| **Tipo** | Planejamento — **uma sprint → teste manual → próxima** |
| **Backend / SQL / Redis / Socket Protocol / Workers / Flags catalog / ADR-010–013** | **NÃO ALTERAR** |

---

## Contexto

Ownership Closure unificou **ownership** (Instance → Conversation → Messages → Preview).  
O teste manual mostrou que a UI ainda divergia em **render / fallback / hydrate da thread**:

| Sintoma (print) | Hipótese principal |
|---|---|
| Float: área vazia + só “Carregar mensagens anteriores” | `ref` duplicado → `scrollRef` morto → virtualizer TanStack sem viewport |
| Lista: preview ok + “Sem mensagens recentes” abaixo | 2ª linha usa o **mesmo** fallback quando `lastMessageAt` é null |
| `/chat`: thread sem a mensagem refletida no preview | Hydrate latest page / timing Store vs row de inbox |

Este plano **não** reabre MB-028, Kanban B, nem flip de flags.

---

## Princípio

Uma **correção testável** por sprint.  
Não misturar Float virt + copy da lista + Chat open no mesmo PR mental.  
Observações fora de escopo → closeout apenas.

---

## Destino funcional (após todas as sprints)

```
Lista inbox
  preview = última msg (texto)
  linha de tempo = lastMessageAt formatado OU placeholder neutro (não “Sem mensagens recentes”)

Float window
  mesmas mensagens do Store pintadas na UI
  Load More só com thread visível / coerente
  scroll no fim após open

Chat page
  após abrir conversa: última bolha alinhada ao preview da lista
  (Store ON + loadMessagesCommand latest)
```

---

## Protocolo de execução

| Comando do usuário | Ação do agente |
|---|---|
| `ok sprint 1` | Implementa Sprint 1 + docs + closeout |
| `ok sprint 2` | Idem Sprint 2 |
| `ok sprint N` | Idem Sprint N |

### Ciclo obrigatório (igual ao plano anterior)

```
ok sprint N
    → agente implementa + SPRINT_N_CLOSEOUT.md (resumo da entrega)
    → usuário testa o critério de aceite
    → se OK → ok sprint N+1
    → se fail → reportar sintoma; agente corrige **nessa** sprint antes de avançar
```

### Regra de observação

- Problemas fora do escopo da sprint ativa: **não corrigir**.  
- Registrar em `Observações (não corrigidas)` do closeout.  
- Só entram em sprint própria (ou follow-up autorizado).

### Artefatos por sprint

| Momento | Arquivo |
|---|---|
| Plano (este) | `PLAN_CHAT_THREAD_SURFACE_FIXES.md` |
| Spec (ao iniciar, se precisa) | `SPRINT_TF_N_<SLUG>.md` **ou** `SPRINT_N_<SLUG>.md` neste diretório* |
| Fecho (obrigatório) | `SPRINT_N_CLOSEOUT.md` **nesta trilha*** |

\*Para evitar colisão com Ownership (`SPRINT_1_CLOSEOUT` já existe), os closeouts **desta** trilha usam prefixo:

| Sprint deste plano | Spec | Closeout |
|---|---|---|
| 1 | `SPRINT_TF1_FLOAT_SCROLL_REF.md` | `SPRINT_TF1_CLOSEOUT.md` |
| 2 | `SPRINT_TF2_LIST_PREVIEW_FALLBACK.md` | `SPRINT_TF2_CLOSEOUT.md` |
| 3 | `SPRINT_TF3_PREVIEW_AT_PRESERVE.md` | `SPRINT_TF3_CLOSEOUT.md` |
| 4 | `SPRINT_TF4_CHAT_LATEST_PARITY.md` | `SPRINT_TF4_CLOSEOUT.md` |

Comando do usuário permanece curto: **`ok sprint 1`** … **`ok sprint 4`** (contexto = este plano, enquanto estiver ativo).

---

## Ordem das sprints

| Sprint | Título | Prioridade | Estimativa |
|---|---|---|---|
| **1** | Float scroll ref + virtualizer paint | **P0** | 0,5 |
| **2** | Lista: fallback de tempo ≠ “Sem mensagens recentes” | **P0** | ~0,25 |
| **3** | Preview 10D: preservar `lastMessageAt` se `sentAt` ausente | **P1** | ~0,5 |
| **4** | Chat open: última bolha = preview da lista | **P0** | 0,5–1 |

```
Sprint 1 (Float refs / virt)     ← desbloqueia print 3
    → teste manual Float
Sprint 2 (copy/fallback lista)   ← desbloqueia print 1 (UI)
    → teste manual lista
Sprint 3 (At preserve 10D)       ← raiz de dados do print 1 (se ainda nulo)
    → teste lista pós-hydrate
Sprint 4 (Chat latest parity)    ← print 2 / “msg mais recente”
    → teste Chat = preview
```

**Por que esta ordem:** sem Float pintando, o teste de parity Float/Chat fica cego. Copy da lista é rápido e reduz ruído no QA. At preserve antes do Chat evita misturar sintomas de meta/timestamp com hydrate.

---

## Sprint 1 — Float scroll ref + virtualizer paint

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — `SPRINT_TF1_CLOSEOUT.md` + hotfix **TF1.1** (`SPRINT_TF1.1_CLOSEOUT.md`) |
| **Prioridade** | P0 |
| **Sintoma** | Float vazio + só “Carregar mensagens anteriores” |

### Problema

Dois `ref` no mesmo `div` em `FloatingConversationWindow` (`scrollRef` + `messageHistoryScrollRef`).  
Último vence → TanStack Virtual com `getScrollElement() === null` → zero bolhas; Load More ainda aparece se `hasMore`.

### Escopo

1. Unificar refs (`mergeRefs` ou um único ref compartilhado)
2. Garantir `useVirtualizedMessages` / `onScroll` / Load More usam o **mesmo** elemento
3. Com virt ON: scroll to bottom no open / append (paridade mínima com Chat)
4. Teste unitário ou smoke: ref anexado / virt recebe elemento (se factível); senão checklist manual no closeout

### Critério de aceite (teste do usuário)

- [ ] Abrir Float numa conversa com ≥40 msgs (ou `VITE_CHAT_VIRTUAL_MESSAGES=1`): **bolhas visíveis**
- [ ] Botão “Carregar mensagens anteriores” só faz sentido **com** histórico visível / carregando anteriores
- [ ] Mensagem recente (igual ao preview da lista, se já no Store) **aparece** na janela
- [ ] Header permanece OK (não regressar Sprint 2 Ownership)

### Não fazer

- Mudar ADR-011 latest-page  
- Migrar Float para Message Virtual Engine core  
- Corrigir copy da lista / Chat open (sprints 2–4)

### Closeout esperado

`SPRINT_TF1_CLOSEOUT.md` — o que mudou + checklist de teste + Observações.

---

## Sprint 2 — Lista: fallback de tempo

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — ver `SPRINT_TF2_CLOSEOUT.md` (teste manual pendente) |
| **Prioridade** | P0 |
| **Sintoma** | Preview texto OK + “Sem mensagens recentes” na linha de tempo |

### Problema

`FloatingConversationList` (e padrão similar no Chat list) reusa a string **“Sem mensagens recentes”** quando `lastMessageAt` é falsy — enquanto a linha de preview já mostra texto.

### Escopo

1. Linha de **preview**: continua “Sem mensagens recentes” só se **não** houver preview  
2. Linha de **tempo**: se sem `lastMessageAt` → placeholder neutro (`—` / ocultar / “—”) — **nunca** a mesma frase do vazio de preview  
3. Alinhar Chat lista e Float lista (mesmo contrato visual)

### Critério de aceite

- [ ] Caso preview `"to contando os dias"` + At nulo: **não** aparece “Sem mensagens recentes” sob o texto  
- [ ] Caso sem preview e sem At: uma única mensagem de vazio (não duplicada)  
- [ ] Float + `/chat` sidebar coerentes

### Não fazer

- Alterar `previewFromMessages` / sync 10D (Sprint 3)  
- Touch no virtualizer Float

### Closeout esperado

`SPRINT_TF2_CLOSEOUT.md`

---

## Sprint 3 — Preview 10D: preservar `lastMessageAt`

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — ver `SPRINT_TF3_CLOSEOUT.md` (teste manual pendente) |
| **Prioridade** | P1 |
| **Sintoma** | Após hydrate, At some mesmo com preview/texto válido |

### Problema

`syncConversationPreviewFromMessages` define `lastMessageAt = last?.sentAt ?? null`.  
Message com body sem `sentAt` → zera At do inbox e a UI (mesmo pós–Sprint 2) perde tempo relativo.

### Escopo

1. Ao sync 10D: se `last.sentAt` ausente, **preservar** `existing.lastMessageAt` (não sobrescrever com null)  
2. Se thread hydrate `[]`: manter contrato 10D (preview limpa) — não reinventar orphans  
3. Testes em `store.phase10d.preview-messages.test.ts`  
4. Métrica/observação se já existir path métricas preview

### Critério de aceite

- [ ] Hydrate com última msg sem `sentAt` mas com body: preview texto atualizado **e** At anterior preservado (se existia)  
- [ ] Hydrate normal com `sentAt`: At = da última msg  
- [ ] Suite 10D passa

### Não fazer

- Backend preenchendo `sentAt`  
- Reabrir ownership de Preview além deste preservo

### Closeout esperado

`SPRINT_TF3_CLOSEOUT.md`

---

## Sprint 4 — Chat open: última bolha = preview

| Campo | Valor |
|---|---|
| **Status** | **CLOSED** — ver `SPRINT_TF4_CLOSEOUT.md` (aguardando teste manual) |
| **Prioridade** | P0 |
| **Sintoma** | Preview da lista à frente da thread em `/chat` |

### Problema

Com Store ON, open usa `loadMessagesCommand` (Sprint 3 Ownership removeu warm IDB).  
Se latest page / race / geração descartada / scroll, a bolha mais recente do preview pode não aparecer no viewport ou no slice.

### Escopo (audit-first no início da sprint, depois fix mínimo)

1. Confirmar no código/teste: última msg do Store vs `lastMessagePreview` pós-open  
2. Corrigir causa raiz **mínima** (ex.: force open, order apply, scroll-to-bottom core, race generation)  
3. Garantir que Float (pós Sprint 1) e Chat leem o **mesmo** slice Store  
4. Teste(s) de regressão focados + checklist manual

### Critério de aceite

- [ ] Abrir conversa cujo preview é `"X"` → última bolha (ou conteúdo equivalente) mostra `"X"`  
- [ ] Float da mesma conversa (pós Sprint 1) mostra a mesma última msg  
- [ ] Sem reload de inbox só para “consertar” preview

### Não fazer

- Unificar Kanban  
- Remoção física Store OFF  
- Refactors grandes de Chat.tsx fora do open/scroll/load

### Closeout esperado

`SPRINT_TF4_CLOSEOUT.md` — causa raiz encontrada + fix + teste.

---

## Restrições globais

- Frontend only  
- Sem Feature Flags catalog / defaults  
- Sem Backend / SQL / Redis / Socket protocol / Workers  
- Respeitar ADR-010, ADR-011 (latest-page Float), ADR-013 (Runtime Core = Domain Store)  
- Observações OOS → closeout só

---

## Checklist “como usar”

1. Ler este plano.  
2. Digitar **`ok sprint 1`**.  
3. Agente entrega fix + `SPRINT_TF1_CLOSEOUT.md` (**resumo da entrega**).  
4. **Você testa** o critério de aceite da Sprint 1.  
5. Se OK → **`ok sprint 2`**, e assim por diante.  
6. Se falhar o teste → descreva o sintoma; não avançar sprint até fechar.

---

## Índice de closeouts

| Sprint | Closeout | Status |
|---|---|---|
| 1 · Float scroll/virt | `SPRINT_TF1_CLOSEOUT.md` | **CLOSED** |
| 1.1 · sentAt order | `SPRINT_TF1.1_CLOSEOUT.md` | **CLOSED** (teste manual) |
| 2 · Lista fallback | `SPRINT_TF2_CLOSEOUT.md` | **CLOSED** (teste manual) |
| 3 · Preview At preserve | `SPRINT_TF3_CLOSEOUT.md` | **CLOSED** |
| 3.1 · Lean WS ghost | `SPRINT_TF3.1_CLOSEOUT.md` | **CLOSED** |
| 3.2 · Avatar upsert preserve | `SPRINT_TF3.2_CLOSEOUT.md` | **CLOSED** (teste manual) |
| 3.3 · Avatar F5 / view=list | `SPRINT_TF3.3_CLOSEOUT.md` | **CLOSED** (aguardando teste) |
| 4 · Chat latest parity | `SPRINT_TF4_CLOSEOUT.md` | **CLOSED** (aguardando teste) |
| **TF5** · Dup WS + ordem lista | `SPRINT_TF5_CLOSEOUT.md` (+ [`AUDIT_TF5_…`](./AUDIT_TF5_DUPLICATE_MESSAGES_INBOX_ORDER.md)) | **CLOSED** (aguardando teste) |

---

## Assinatura do plano

| | |
|---|---|
| Plano | **ATIVO** (sprints 1–4 + TF5 entregues; aguarda QA) |
| Predecessor | Ownership Closure **CLOSED** |
| Ordem | **… → TF4 Chat parity → TF5 dedupe + orderedIds** |
| Próximo comando | Teste manual TF5 A+B; sintomas → novo hotfix / plano |
