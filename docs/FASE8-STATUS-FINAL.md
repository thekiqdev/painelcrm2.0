# Fase 8 — Status final

**Data de referência (documentação):** consolidado com `PLANO-CORRECAO-FASE-8-V2.md` e auditoria em `docs/FASE8-AUDITORIA-FINAL.md`.

---

## Status

| Dimensão | Status |
|----------|--------|
| **Código + documentação no repositório** | **CONCLUÍDA** |
| **Produção (cada ambiente)** | **CONCLUÍDA** somente após **aceite operacional** — `docs/FASE8-ACEITE-OPERACIONAL.md` (go/no-go + evidências). Até lá: ressalva operacional. |

---

## O que foi entregue (Fase 8)

- **A1:** Consistência UI × backend para gateway CRM **ativo** (`getActiveConfig`), sem prometer “teste de conexão” como pré-requisito de fatura.
- **B3:** `ClientSearchCombobox` nas telas operacionais acordadas + escopo/exceções em `B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md`.
- **B4:** Busca server-side de cobranças; paginação básica na UI de lista.
- **H1–H4:** Documentação expandida (pagamento público, PCI, webhook×UI, worker/recorrência).
- **Migrações 80/81:** Scripts + `migrate.ts` + schema adaptativo (`customerInvoiceSchema.ts` e consumidores) + runbook `FASE8-ROLLOUT-MIGRACOES-80-81.md`.
- **Plano V2:** Seções alinhadas ao estado atual (sem descrever H como stub nem A1/B3 como pendentes).

---

## O que **não** faz parte da Fase 8

- Implementação de **Fase 9** (novas regras de recorrência, flags adicionais, etc.).
- **Cartão embutido**, **G3** multi-método na mesma fatura, **novos gateways** além do contrato atual.
- **Migração forçada** de telas mock (`Proposals`) ou de todos os módulos possíveis para `ClientSearchCombobox` sem escopo explícito.
- Alteração de **webhook**, **createCharge** ou **fluxo de pagamento** — intocável nesta fase.

---

## Próxima fase (Fase 9) — apenas referência

A continuidade do produto segue o **plano de continuidade** já existente:

- `docs/PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` (Fase 9: recorrência por item, E2, flags `ENV-BILLING`, etc.).
- `docs/FASE9-RECORRENCIA-POR-ITEM.md`
- `docs/ENV-BILLING.md`

**Nenhuma tarefa da Fase 9 deve ser iniciada como parte do fechamento da Fase 8** — apenas `docs/FASE9-PREPARACAO.md` (preparação) após aceite Fase 8.

---

## Documentos relacionados

| Documento | Uso |
|-----------|-----|
| `PLANO-CORRECAO-FASE-8-V2.md` | Plano mestre V2 (atualizado §B, §2). |
| `FASE8-ROLLOUT-MIGRACOES-80-81.md` | Ordem das migrações, rollback, smoke técnico. |
| `FASE8-AUDITORIA-FINAL.md` | Auditoria, uso 80/81 no código, checklist produção. |
| `FASE8-ACEITE-OPERACIONAL.md` | **Fechamento real por ambiente** (smokes S1–S9, evidências, go/no-go). |
| `FASE8-VALIDACAO-AMBIENTE.md` | **Execução prática:** comandos, SQL, curl, template de evidência, alertas. |
| `FASE9-PREPARACAO.md` | Preparação para abrir Fase 9 (sem implementação). |
| `B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md` | Escopo B3. |
| `H1-FASE6-PAGAMENTO-PUBLICO.md` / `H2-H3-H4-FASE8-STUBS.md` | Estudos H1–H4. |
