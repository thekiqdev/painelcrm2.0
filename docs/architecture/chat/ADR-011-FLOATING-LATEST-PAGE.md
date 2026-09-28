# ADR-011 — Floating Chat Latest-Page Messages

| Campo | Valor |
|---|---|
| **ADR** | ADR-011 |
| **Título** | Floating Chat uses latest-page message hydration (Store ON) |
| **Data** | 2026-07-14 |
| **Status** | **Accepted** |
| **Sprint** | Phase 5 / MB-019 |
| **Supersede** | — |
| **Relacionados** | ADR-010, DOMAIN_STORE_FREEZE, PUBLIC_API_FREEZE, F6.1 Load More |

---

## Contexto

Com Store ON, o Chat principal já hidrata mensagens via `loadMessagesCommand` com **última página + cursor**. O Floating ainda forçava `{ latestPage: false }` (dump integral), gerando payload/memória altos — residual documentado no ADR-010.

ADR-010 exige ADR próprio antes de alterar caminhos Floating pages / Core hydration call sites nesta superfície.

---

## Decisão

1. Floating com `CHAT_CORE_STORE` ON passa a usar **latest-page** (default do comando) e **Load More** no topo da thread (mesmo contrato F6.1).
2. **Não** alterar o contrato público de `loadMessagesCommand` (opción `latestPage` permanece).
3. Dump integral permanece disponível como **rollback**:
   - `VITE_FLOAT_MESSAGES_DUMP=1` → Floating chama `{ latestPage: false }`
4. Path Store OFF (React Query `getConversationMessages`) permanece dump (legado coexistente) — sem remoção.
5. Nenhum schema de Domain Store alterado.

---

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Mudar default de `loadMessagesCommand` para dump | Regrediria Chat principal |
| Remover path `latestPage: false` | Viola coexistência / rollback |
| Float sem Load More + latest-page | UX incompleta (histórico inacessível) |

---

## Consequências

### Positivas

- Menor payload/memória no Floating Store ON
- Alinha Float ↔ Chat no pipeline Commands → Store
- Rollback por env sem redeploy de contrato

### Negativas

- Store OFF continua dump até canário Store
- Operadores precisam `VITE_FLOAT_MESSAGES_DUMP=1` para dump forçado

---

## Rollback

```bash
VITE_FLOAT_MESSAGES_DUMP=1
```

Rebuild frontend. Path legado permanece no código.
