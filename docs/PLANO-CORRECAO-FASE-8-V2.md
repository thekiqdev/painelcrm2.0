# Plano de correção — Fase 8 (V2)

**Tipo:** auditoria final de aderência ao plano + plano de fechamento de gaps.  
**Base:** `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` (§6 Fase 8, §8–9), `AUDITORIA-FUNCIONAL-FATURAS-UX.md`, `PLANO-CORRECAO-UX-FATURAS.md`, implementações recentes em frontend (página pública, status, pós-criação, mobile).  
**Premissa (pós-consolidação):** itens críticos do V2 estão **atendidos no repositório** (§6, §7, `docs/FASE8-AUDITORIA-FINAL.md`). O **fechamento em produção** por ambiente depende do checklist operacional (migrações 80/81 + smoke) em `docs/FASE8-AUDITORIA-FINAL.md` §6 e `docs/FASE8-STATUS-FINAL.md`. Melhorias de UX premium **não substituem** entregas estruturais da Fase 8.

**Regras deste documento:** sem sugestão de Fase 9; sem novas features de produto além do necessário para fechar a Fase 8.

---

## A. Classificação do que foi implementado recentemente (UX / frontend)

Trabalhos alinhados a `PLANO-CORRECAO-UX-FATURAS` e evolução premium da área de faturas (ex.: `/pay`, estados visuais, confiança, pós-criação, mobile, `customerInvoiceStatusUi`):

| Classificação | Interpretação |
|---------------|----------------|
| **⚠️ Complementar (válido, não planejado como crítico na Fase 8)** | Refina §7 do plano de continuidade (prioridade baixa/média: copy, acessibilidade parcial, densidade, consistência visual). **Valor real**, mas **fora do núcleo crítico** da Fase 8 (B4, H, migração, B3, A1 semântico). |
| **✔️ Parcialmente alinhado à Fase 8** | Padronização de **rótulos/cores de status** entre listagem, detalhe e público — ecoa o item de “padronização de textos” / consistência, ainda que o plano não listasse um módulo `customerInvoiceStatusUi` nominalmente. |
| **❌ Não substitui (contexto histórico)** | No fechamento V2, B3/H/80–81/A1 foram tratados em código e docs; o pacote UX **complementa**, não substituiu esses itens. |

**Conclusão:** o pacote UX é **mantido**; os itens estruturais da Fase 8 V2 foram **entregues** conforme §6–§7 e `FASE8-AUDITORIA-FINAL.md`.

---

## B. Revalidação dos itens críticos da Fase 8 (**estado atual — pós-consolidação**)

### B4 — Busca de cobranças server-side

| Aspecto | Situação |
|---------|----------|
| **Status** | **Concluído (núcleo B4).** Backend: `customerChargesService.ts` com `filters.q` (ILIKE descrição, id, dados do cliente via `LEFT JOIN`). UI: `CustomerCharges.tsx` com paginação por offset; outros fluxos (ex.: nova fatura) podem enviar `q` à API. |
| **Opcional futuro** | Input de busca `q` na própria página de listagem de cobranças — melhoria de UX, não bloqueio Fase 8. |

### A1 — Gateway CRM / pré-condições de fatura

| Aspecto | Situação |
|---------|----------|
| **Status** | **Concluído e consistente.** Regra: `getActiveConfig('crm', tenantId)` (`is_active` + `status = 'active'`). UI (`CustomerInvoiceNew`, `CustomerInvoices`) e JSDoc (`customerInvoicePreconditions.ts`) descrevem **provedor ativo**, sem exigir `last_connection_test_at` / `last_connection_status`. |
| **Decisão** | Copy alinhada à regra (não “testado” como promessa na jornada de fatura). |

### B3 — Padronização do componente de cliente

| Aspecto | Situação |
|---------|----------|
| **Status** | **Concluído no escopo V2.** `ClientSearchCombobox` nas telas listadas em `docs/B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md`; exceções **documentadas** (ex.: `Proposals.tsx` mock, listagens só leitura, rotas com cliente fixo). |
| **Não é critério** | 100% de todas as telas do repositório sem inventário — o plano aceita escopo + exceções explícitas. |

### C1 — Gateway na criação da fatura

| Aspecto | Situação |
|---------|----------|
| **Status** | **Coerente (mantido).** `createManualInvoice` + `gateway_key` opcional; validação contra config ativa; UI com seletor quando >1 gateway. |

### H1–H4 — Documentos técnicos

| Doc | Conteúdo atual |
|-----|----------------|
| **H1** | `docs/H1-FASE6-PAGAMENTO-PUBLICO.md` — matriz por gateway (Asaas + futuro), fluxo webhook, ligação com recorrência. |
| **H2–H4** | `docs/H2-H3-H4-FASE8-STUBS.md` — PCI (H2), webhook×UI + checklist de testes (H3), worker/recorrência/E2/migração 80 (H4). **Conteúdo consolidado** (nome de arquivo histórico). |
| **Status** | **Concluído** para os critérios Fase 8 V2. Evolução por segundo gateway ativo = trabalho futuro documentado no próprio H1. |

### Migrações 80 e 81 — schema adaptativo

| Aspecto | Situação |
|---------|----------|
| **Código** | **Concluído.** `getCustomerInvoiceSchema()` + uso em `customerInvoiceService`, `customerBillingService`, `recurringBillingJobService` — detalhe em `docs/FASE8-AUDITORIA-FINAL.md` §5. |
| **Operação** | Aplicação em **cada ambiente** + smoke: `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md` + checklist §6 de `FASE8-AUDITORIA-FINAL.md`. |

---

## C. Desvio de escopo

| O que foi feito | Impacto na prioridade |
|-----------------|------------------------|
| UX premium em `/pay`, detalhe, listagem, pós-criação, mobile, trust copy | **Não compete** com B3/H/migração; melhora percepção de produto. **Manter.** |
| Módulo `customerInvoiceStatusUi` | Reforça consistência; **manter.** |
| Itens críticos V2 | **Fechados** no repositório; ver `FASE8-AUDITORIA-FINAL.md`. |

**Adiar:** incrementos UX **adicionais** além do V2 e Fase 9 conforme `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md`.

---

## 1. Itens críticos (histórico → V2)

*Atendidos no código/docs conforme §6 e §7; o único gate que permanece **fora do repositório** é aplicar migrações 80/81 em cada ambiente com evidência operacional.*

1. ~~B3~~ — Escopo documentado + telas operacionais migradas (`B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md`).  
2. ~~H1–H4~~ — Documentos expandidos (não stub).  
3. ~~A1~~ — Copy alinhada à regra `getActiveConfig` / ativo (sem prometer “testado” via `last_connection_*`).  
4. **Migração 80/81 em produção** — runbook em `FASE8-ROLLOUT-MIGRACOES-80-81.md`; execução e smoke por ambiente.  

---

## 2. Estado pós-consolidação (não são bloqueios V2)

| Item | Nota |
|------|------|
| **A1** | **Concluído:** textos “provedor ativo” + `getActiveConfig`. Eventual uso futuro de `last_connection_*` na **regra** = decisão de produto fora desta fase. |
| **H1–H4** | **Concluído** para Fase 8. Extensão por novo gateway/cartão embutido = evolução documentada nos próprios H*. |
| **B4** | **Atendido** (busca server-side + paginação lista). Refinos opcionais de UX na listagem de cobranças. |
| **Migrações 80/81** | **Evidência operacional** (ticket, data, smoke) por ambiente — checklist em `docs/FASE8-AUDITORIA-FINAL.md` §6; status em `docs/FASE8-STATUS-FINAL.md`. |

---

## 3. Itens implementados fora do escopo estrito da Fase 8

| Entrega | Recomendação |
|---------|----------------|
| UX premium `/pay`, confiança, pago confirmado, pós-criação, mobile, status unificado | **Manter** — complementar; não remover. |
| Copy em jornadas de fatura | **A1 tratado** — evitar promessa de “testado” como pré-requisito onde a regra é só “ativo”. |

---

## 4. Ordem de implementação (referência histórica — **executada** no V2)

Os passos abaixo foram seguidos para fechar gaps; novos deploys devem apenas respeitar **migrações antes de depender de colunas 80/81** e o checklist em `FASE8-AUDITORIA-FINAL.md` §6.

1. Operação: migrações **80** e **81** em staging/prod + smoke.  
2. A1: copy alinhada à regra `getActiveConfig`.  
3. B3: inventário + `ClientSearchCombobox` nas telas acordadas.  
4. H1–H4: docs expandidos.  
5. B4: já atendido no núcleo (busca + paginação).  

**Não** reordenar deploy de backend que **exija** colunas 80/81 sem migração aplicada (comportamento degradado documentado no runbook).

---

## 5. Riscos residuais (pós-V2)

| Risco | Severidade |
|-------|------------|
| Produção **sem** migrações 80/81 aplicadas | **Médio** — API estável (fallback), mas **degradação** (recorrência por item / E2 não persistem corretamente). Mitigação: checklist §6 em `FASE8-AUDITORIA-FINAL.md`. |
| Evolução cartão embutido / novo gateway sem atualizar H1–H4 | **Médio** — documentação deve ser estendida **antes** de mudar contrato de pagamento. |
| Nome de arquivo `H2-H3-H4-FASE8-STUBS.md` | **Baixo** — conteúdo atualizado; possível confusão só pelo nome. |
| Copy “gateway” vs “provedor” em telas legadas | **Baixo** — cosmético/CS. |

---

## 6. Critério sugerido para “Fase 8 encerrada”

- [x] B3: escopo acordado de telas migradas **e** lista explícita de exceções — ver `docs/B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md`.  
- [x] A1: copy alinhada à regra real (**provedor ativo** via `getActiveConfig`; sem exigir `last_connection_*`); JSDoc em `customerInvoicePreconditions.ts`.  
- [x] H1–H4: documentação expandida — `docs/H1-FASE6-PAGAMENTO-PUBLICO.md`, `docs/H2-H3-H4-FASE8-STUBS.md`.  
- [x] Migrações 80/81: runbook — `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md` (evidência operacional por ambiente continua sendo ticket/checklist interno).  
- [x] Nenhum gap **crítico** de código aberto na matriz §2 relativo aos itens acima (B4 opcional de UI não era obrigatório).  

---

## 7. Entrega plano V2 (execução)

| Item | Entrega |
|------|---------|
| A1 | Textos em `CustomerInvoiceNew.tsx`, `CustomerInvoices.tsx`; comentários em `customerInvoicePreconditions.ts`. |
| B3 | `CustomerCharges.tsx`, `NewTicket.tsx`, `Tasks.tsx` + `docs/B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md`. |
| H1–H4 | Docs citados acima (matriz gateway, webhook, recorrência/worker). |
| 80/81 | `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md`. |
| B4 | Sem mudança — lista de cobranças já com paginação por offset. |

---

## 8. Consolidação produto / operação

- **Auditoria final:** `docs/FASE8-AUDITORIA-FINAL.md` (uso 80/81 no código, com/sem migração, checklist produção).  
- **Status:** `docs/FASE8-STATUS-FINAL.md` (CONCLUÍDA no repo; produção após aceite).  
- **Aceite operacional (fechamento real por ambiente):** `docs/FASE8-ACEITE-OPERACIONAL.md`.  
- **Validação prática (execução):** `docs/FASE8-VALIDACAO-AMBIENTE.md`.  
- **Preparação Fase 9 (sem implementar):** `docs/FASE9-PREPARACAO.md`.  

---

*Documento vivo. Execução da Fase 9: somente após go em `FASE8-ACEITE-OPERACIONAL.md`; ver `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` e `FASE9-RECORRENCIA-POR-ITEM.md`.*
