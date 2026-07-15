# SPRINT_5_CLOSEOUT — Phase 10K-GATE · Kanban Decision

| Campo | Valor |
|---|---|
| **Sprint** | 5 |
| **Phase** | 10K-GATE |
| **Gate** | **CLOSED** |
| **Data** | 2026-07-15 |
| **Código alterado** | **Nenhum** (decisão apenas) |
| **Backend / SQL / Redis / Socket / Flags / ADR** | **Não alterados** |

---

## Decisão oficial

# **Opção A — Residual oficial**

O **board Kanban** (`listCards` → DTO `conv_*` → `ChatKanbanPage` local `cards`) é uma **projeção de produto**.

- **Não** faz parte da Source of Truth Conversation/Messages do Chat/Floating Domain Store.  
- **Não** será absorvido neste ciclo de Runtime Ownership Closure (Sprints 1–4 / Phase 11 legacy Chat).  
- Unificação (Opção B) exige **ADR próprio** + sprint dedicada, só após canário Store ON estável e se houver dor de produto mensurável.

---

## Justificativa

| Critério | Avaliação |
|---|---|
| Cura Preview≠Thread / Header / Instance? | **Não** — já endereçado nas Sprints 1–4 + 10D |
| Shape de dados | Board `conv_*` ≠ `ChatConversation` de lista/thread |
| Risco | Alto (board SQL/API + drag/columns + attendance board) |
| Alinhamento | Consistente com 10B residual + review pós-10C |
| Momento | Chat/Float SoT deve canariar antes de ampliar fronteira |

---

## Contrato residual (Opção A)

```
Domain Store (Chat / Floating)
        │
        │  (não alimenta board)
        │
Kanban API listCards ──► conv_* DTO ──► ChatKanbanPage setCards
```

| Permitido | Proibido (sob Opção A) |
|---|---|
| Board atualizar via `listCards` / socket refresh Kanban | Tratar `cards[]` como SoT de Conversation Chat |
| Picker efêmero ao add-card (HTTP search) | Replace inbox Chat/Float a partir do board |
| Bridges de unread/attendance pontuais já existentes | Exigir Domain Store para render do card |

---

## Quando reabrir Opção B

Somente se **todas** forem verdade:

1. Store ON estável em canário/prod (pós Sprint 6 / Phase 11 path).  
2. Divergência Chat↔Kanban com impacto de negócio documentado (não só teórico).  
3. ADR aprovado (“Kanban board projection from Domain Conversation” ou reverse).  
4. Sprint de implementação isolada (não misturar com Legacy Retirement).

---

## Observações (não corrigidas)

1. **GET residual on socket Kanban** (Phase 9 residual HTTP) — fora deste gate; não implementado.  
2. **Add-card picker** continua lista HTTP efémera — aceito sob Opção A.  
3. **Aquisição / `acquisition_lead_id` no card** — domínio board; não mapeado ao Conversation Store nesta trilha.

---

## Artefatos

| Arquivo | |
|---|---|
| `SPRINT_5_KANBAN_GATE.md` | Spec do gate |
| `SPRINT_5_CLOSEOUT.md` | Este — decisão **A** |

---

## Próximo

```
ok sprint 6
```

→ Phase 11 · Legacy Retirement (**após canário Store ON** — se canário ainda não rodou, o sprint 6 deve apenas preparar/documentar ou aguardar confirmação do usuário).
