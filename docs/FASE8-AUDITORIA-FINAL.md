# Fase 8 — Auditoria final (consolidação)

**Base:** `docs/PLANO-CORRECAO-FASE-8-V2.md`, `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md`  
**Escopo:** alinhamento código × documentação × operação. **Sem** novas features, **sem** alteração de lógica de pagamento, webhook ou arquitetura.

---

## 1. Lista do que foi implementado (itens do plano V2)

| ID | Item | Entrega (código / doc) |
|----|------|-------------------------|
| **A1** | Gateway: UI alinhada à regra real | `CustomerInvoiceNew.tsx`, `CustomerInvoices.tsx`: provedor CRM **ativo** (`status = ativo`); não promete “testado” via `last_connection_*`. `customerInvoicePreconditions.ts`: JSDoc explícito (`getActiveConfig`). |
| **B3** | Padronização de seleção de cliente | `ClientSearchCombobox` em: nova fatura, wizard projeto (`Step2BasicConfig`), nova cobrança, novo ticket, nova tarefa (modal). Inventário: `docs/B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md`. |
| **B4** | Busca server-side de cobranças | Backend `customerChargesService.listCharges` com `q`; UI `CustomerCharges.tsx` com paginação offset. Expor `q` na listagem de cobranças = opcional UX. |
| **C1** | Gateway na criação da fatura | `createManualInvoice` + `gateway_key` opcional; validação contra config ativa — já coerente antes do V2 (mantido). |
| **H1** | Pagamento público / matriz gateway | `docs/H1-FASE6-PAGAMENTO-PUBLICO.md`: matriz Asaas + futuro, fluxo webhook, impacto recorrência. |
| **H2** | PCI / cartão | `docs/H2-H3-H4-FASE8-STUBS.md` §H2: redirect hospedado, matriz de risco. |
| **H3** | Webhook × UI | Mesmo doc §H3: autoridade do webhook, polling, checklist de testes sugeridos. |
| **H4** | Worker × recorrência por item | Mesmo doc §H4: jobs, E2, migração 80, risco de duplicação de regras. |
| **M80/M81** | Migrações + fallback | SQL em `database/init/80_*.sql`, `81_*.sql`; `migrate.ts`; `getCustomerInvoiceSchema()` + uso em serviços (ver §3). Runbook: `FASE8-ROLLOUT-MIGRACOES-80-81.md`. |

**Complementares (fora do núcleo crítico V2, já existentes):** UX `/pay`, `customerInvoiceStatusUi`, pós-criação, mobile — mantidos; não substituem os itens acima.

---

## 2. Itens parcialmente implementados (pós-Fase 8)

| Item | Situação |
|------|----------|
| **B3 em 100% das telas do monorepo** | **Não** é critério V2: escopo fechado com exceções documentadas (`Proposals.tsx` mock, contextos só leitura, etc.). |
| **B4 UI lista** | Campo de busca `q` na página `CustomerCharges` (além do suporte na API) pode ser adicionado depois; **não** bloqueia Fase 8. |
| **Evidência operacional 80/81** | Depende de **cada ambiente** (ticket + data + executor + smoke) — não versionável no Git além do checklist abaixo. |

Nenhum item **crítico** do V2 permanece aberto no repositório.

---

## 3. Itens fora de escopo da Fase 8

- **Fase 9:** recorrência avançada adicional, flags novas, novos fluxos E2 além do já documentado — ver `FASE9-RECORRENCIA-POR-ITEM.md` (não executar nesta fase).
- **Cartão embutido / multi-gateway G3** — explícito em H1/H2 como futuro.
- **Endurecer A1 com `last_connection_*`** — decisão de produto adiada; vigente = `getActiveConfig` / ativo.
- **Substituir `Proposals.tsx` mock** por combobox real — quando houver API de propostas.

---

## 4. Divergências plano × código

| Tema | Observação |
|------|------------|
| Nenhuma divergência **ativa** nos critérios §6 do V2 | A1, B3, H1–H4 e padrão 80/81 batem com o código atual. |
| Nome do arquivo `H2-H3-H4-FASE8-STUBS.md` | Histórico: conteúdo **não** é mais stub; título interno do arquivo já reflete “documentação consolidada”. Renomear arquivo seria opcional (risco de links). |
| Mensagens de erro API (`validateInvoicePreconditions`) | Podem ainda dizer “Gateway de pagamento não configurado.” — semanticamente equivalente a “sem CRM ativo”; não contradiz A1 na UI. |

---

## 5. Migrações 80 e 81 — uso no código e compatibilidade

### 5.1 Onde são “usadas” (detecção + ramificação)

| Arquivo | Função |
|---------|--------|
| `packages/backend/src/services/customerInvoiceSchema.ts` | `getCustomerInvoiceSchema()`: lê `information_schema`; define `hasInvoiceItemAdvancedColumns` (80), `hasParentInvoiceColumns` (81); monta `selectListFromCi`, `selectListBare`, `insertReturning` com `NULL::uuid` quando colunas ausentes. |
| `customerInvoiceService.ts` | SELECT/INSERT de faturas e itens; `hasInvoiceItemAdvancedColumns` para colunas de item; `hasParentInvoiceColumns` para pai/filho e cláusulas `parent_invoice_id`. |
| `customerBillingService.ts` | Listagem e `getInvoiceById` usam `schema.selectListFromCi` / `selectListBare` para compatibilidade com/sem 81. |
| `recurringBillingJobService.ts` | INSERT de itens no ciclo e em faturas filhas condicionados a `hasInvoiceItemAdvancedColumns`. |

### 5.2 Com migração **aplicada** (80 + 81)

- Colunas de item (`is_recurring`, `recurring_interval`, `scheduled_due_date`) **persistem**.
- Colunas de fatura (`parent_invoice_id`, `parent_invoice_item_id`) **persistem**; fluxos E2/hierarquia funcionam conforme serviços e flags de billing.
- SELECTs retornam colunas reais, não apenas `NULL` alias.

### 5.3 Sem migração **aplicada** (código novo, schema antigo)

- API **não** quebra: queries não referenciam colunas inexistentes.
- **Degradação:** flags de recorrência/agendamento por item **não são gravadas**; vínculos pai/filho em fatura **não persistem**.
- Listas/detalhe de fatura continuam com `NULL` nos campos “virtuais” correspondentes.

---

## 6. Checklist de produção

Para **aceite formal** (go/no-go, smokes numerados S1–S9, critérios de degradação), usar **`docs/FASE8-ACEITE-OPERACIONAL.md`**.  
Para **comandos e ações concretas**, usar **`docs/FASE8-VALIDACAO-AMBIENTE.md`**.  
Abaixo: lista compacta para auditoria. Preencher por ambiente (**staging** / **produção**). Anexar evidência (ticket, data, responsável).

### Migrações e API

- [ ] Migração **80** aplicada (`customer_invoice_items` com as 3 colunas avançadas).
- [ ] Migração **81** aplicada (`customer_invoices` com `parent_invoice_id` e `parent_invoice_item_id`).
- [ ] API reiniciada após migrações.
- [ ] `GET /api/customer-invoices` (ou listagem usada pelo painel) **200** sem erro SQL.

### Faturas e cobrança

- [ ] Criação de fatura manual **200** (`POST /api/customer-invoices` ou fluxo UI equivalente).
- [ ] Pré-condições (CPF/CNPJ cliente + gateway ativo) coerentes com a UI.

### Pagamento e webhook (smoke — **não alterar código**)

- [ ] Página pública `/pay/:token` carrega para fatura pagável (sandbox/homolog).
- [ ] **PIX:** exibição de QR/copia-e-cola quando o gateway retornar payload (conforme ambiente).
- [ ] **Webhook:** após pagamento de teste, `customer_invoices.status` atualizado no banco (conferir log/gateway sandbox).

### Documentação

- [ ] Runbook lido: `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md`.
- [ ] Status registrado: `docs/FASE8-STATUS-FINAL.md` (ou ticket interno referenciando este checklist).

---

## 7. Resumo executivo

- **Código + docs no repositório:** Fase 8 V2 **consolidada** (A1, B3, B4 core, H1–H4, fallback 80/81).
- **Produto em produção “100%”:** exige checklist §6 **executado** por ambiente, com migrações aplicadas e smoke de pagamento/webhook validado.

**Próximo passo organizacional:** Fase 9 conforme `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` — **não** iniciar implementação neste pacote de documentação.
