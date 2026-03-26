# Plano de Continuidade — Evolução de Faturas

## 1. Estado atual
O plano original foi implementado em grande parte, com entregas relevantes em UI, endpoints e persistência aditiva.  
Há, porém, diferenças importantes entre “marcado como concluído” e “concluído de fato” em alguns itens, especialmente em:
- busca de cobranças (B4),
- seleção de gateway na criação (C1),
- recorrência avançada por item (D3/D5/E1/E2),
- pagamento embutido completo (G1/G2/G3),
- estudos técnicos H1–H4.

O sistema preserva o modelo principal (`customer_invoices`, gateway genérico, webhook/status). Rollout Fase 5: aplicar migrações **80** e **81** (E2 pai↔filha).

## 2. Itens concluídos

### Matriz plano vs código (item a item)

| Item | Status | Evidência principal | Observação de aderência |
|---|---|---|---|
| A1 | ✅ IMPLEMENTADO COMPLETO | `GET /api/customer-invoices/gateway-status`, uso em `CustomerInvoiceNew` e `CustomerInvoices` | Critério real = config `crm` **ativa** (`getActiveConfig`); UI alinhada (Fase 8 V2) — **não** exige `last_connection_*` |
| A2 | ✅ IMPLEMENTADO COMPLETO | `CustomerInvoiceNew` (card destacado “Fatura por link”) | Aderente |
| A3 | ✅ IMPLEMENTADO COMPLETO | `CustomerInvoiceDetail` (bloco link no topo) | Aderente |
| A4 | ✅ IMPLEMENTADO COMPLETO | `CustomerInvoiceDetail` (vencimento + criado em no mesmo bloco) | Aderente |
| A5 | ✅ IMPLEMENTADO COMPLETO | `brlCurrencyInput.ts`, uso em `CustomerInvoiceNew` | Aderente |
| A6 | ✅ IMPLEMENTADO COMPLETO | `lineDiscountCents` (% e valor fixo), envio `discount_cents` | Aderente à regra §7.1 #8 |
| A7 | ✅ IMPLEMENTADO COMPLETO | ordem PIX/BOLETO/CARTÃO + sentinela `__default__` | Aderente |
| A8 | ✅ IMPLEMENTADO COMPLETO | `formatInvoiceDueDatePtBr` em `CustomerInvoicePay` | Aderente |
| A9 | ✅ IMPLEMENTADO COMPLETO | máscaras em `CustomerInvoicePay` (telefone/CPF-CNPJ) | Aderente |
| A10 | ✅ IMPLEMENTADO COMPLETO | campo `company` no form público + backend `completePaymentByToken` | Aderente |
| B1 | ✅ IMPLEMENTADO COMPLETO | `GET /api/clients?q=` + `ClientSearchCombobox` remoto | Aderente |
| B2 | ✅ IMPLEMENTADO COMPLETO | `ClientSearchCombobox` + `AddClientDialog` | Aderente |
| B3 | ✅ IMPLEMENTADO (escopo Fase 8) | `ClientSearchCombobox` + `docs/B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md` | Telas operacionais migradas; exceções documentadas (ex. `Proposals` mock) |
| B4 | ✅ IMPLEMENTADO COMPLETO (Fase 8) | `GET /api/customer-charges?q=` + ILIKE em descrição, id, cliente (nome, empresa, e-mail, **telefone**); UI com texto de ajuda e limite 100 | Com cliente selecionado, lista filtra por `client_id` + busca |
| C1 | ✅ IMPLEMENTADO COMPLETO | backend aceita `gateway_key` opcional + UI com seletor opcional (quando >1 gateway ativo/configurado) | Mantém fallback para gateway ativo implícito quando não selecionado |
| C2 | ❌ NÃO IMPLEMENTADO | sem suporte explícito a múltiplos métodos por cobrança no fluxo | Dependente de H1/decisão de negócio |
| C3 | ✅ IMPLEMENTADO COMPLETO (Fase 9) | UI engrenagem + worker + E2 + doc `FASE9-RECORRENCIA-POR-ITEM.md` | Cenários de borda opcionais |
| D1 | ✅ IMPLEMENTADO COMPLETO | `GET /:id/recurrence-history` + card no detalhe | Modelo mínimo via `subscription_id` |
| D2 | ❌ NÃO IMPLEMENTADO | inexistente no código (apenas decisão em documento) | Conforme decisão de manter opcional |
| D3 | ✅ IMPLEMENTADO COMPLETO (Fase 9 + 11) | Motor + doc `FASE9-RECORRENCIA-POR-ITEM.md`; matriz operacional `FASE11-OPERACAO-E-QUALIDADE.md` | — |
| D4 | ❌ NÃO IMPLEMENTADO | recorrência diária não implementada para fatura inteira | Só existe no campo por item (base estrutural), sem execução |
| D5 | ✅ IMPLEMENTADO COMPLETO (Fase 9) | `is_recurring=false` excluído da cópia no ciclo; doc em `FASE9-RECORRENCIA-POR-ITEM.md` | — |
| E1 | ✅ IMPLEMENTADO COMPLETO (Fase 9) | `scheduled_due_date` + avanço no ciclo e na filha E2; flags em `ENV-BILLING.md` | — |
| E2 | ✅ IMPLEMENTADO COMPLETO | migração `81_customer_invoice_parent_child_e2.sql`, `createChildCustomerInvoice`, `processChildItemDueInvoices` no worker | `parent_invoice_id` / `parent_invoice_item_id`, `invoice_type='child'`; renovação exclui item se `scheduled_due_date !== periodStart` |
| F1 | ✅ IMPLEMENTADO COMPLETO | melhorias de layout em `CustomerInvoicePay` | Aderente |
| F2 | ✅ IMPLEMENTADO COMPLETO | `tenant_branding` no endpoint público + header com logo/nome/contato | Aderente ao uso de dados existentes do tenant |
| F3 | ✅ IMPLEMENTADO COMPLETO | A8–A10 mantidos na tela pública | Aderente |
| G1 | ✅ IMPLEMENTADO COMPLETO (Fase 6 + 10) | Idem + `has_payment_payload`, polling adaptativo, alerta sem payload | — |
| G2 | ✅ IMPLEMENTADO COMPLETO (Fase 6 + 10) | Idem + resumo de opções na API para UX/telemetria | Cartão digitado na app fora de escopo |
| G3 | ❌ NÃO IMPLEMENTADO | não há cards de escolha multi-gateway/método | Sem decisão/modelo fechado |
| H1 | ✅ DOCUMENTADO (Fase 8 V2) | `docs/H1-FASE6-PAGAMENTO-PUBLICO.md` | Matriz por gateway (Asaas + linha futura); fluxo webhook; ligação H4 |
| H2 | ✅ DOCUMENTADO (Fase 8 V2) | `docs/H2-H3-H4-FASE8-STUBS.md` §H2 | PCI / redirect; matriz de risco alto nível |
| H3 | ✅ DOCUMENTADO (Fase 8 V2) | idem §H3 | Webhook vs polling + checklist de testes sugeridos |
| H4 | ✅ DOCUMENTADO (Fase 8 V2) | idem §H4 | Worker, recorrência, impacto migração 80; risco duplicação de regras |

## 3. Itens pendentes

### Prioridade alta (produção / consistência do plano)
- ~~Concluir **B4** com busca de cobranças server-side~~ → **Fase 8** (backend já filtrava; reforço telefone + UX).
  - ~~Alinhar A1~~ → **Fase 8 V2**: copy “provedor ativo” + JSDoc em `customerInvoicePreconditions.ts`.
- ~~Formalizar estudos **H1–H4**~~ → **Fase 8 V2**: docs expandidos; evoluir por gateway quando houver segundo provedor ativo ou cartão embutido.

### Prioridade média
- ~~Expandir **B3**~~ → escopo Fase 8 V2 fechado em `B3-CLIENT-SEARCH-COMBOBOX-SCOPE.md`; novos módulos em PRs futuros.
- Evoluir **G1/G2** com fallback robusto por gateway e telemetria de disponibilidade de payload PIX.
- Revisar acessibilidade da tela pública (labels, foco, contraste e copy final).

### Prioridade baixa
- Revisão visual fina da tela pública (microcopy, densidade de informação, estados vazios).
- ~~Padronização A1~~ → “provedor ativo” / `status='active'` (V2).

## 4. Itens parciais
- (A1 V2) Mensagem/UI alinhada a **provedor ativo** (sem prometer teste de conexão).
- **B3**: escopo explícito no doc de inventário; não 100% de todas as telas do repositório (ex. mocks).
- **B4**: busca server-side (`q`) + UI Fase 8.
- **C1**: seletor opcional no create + validação de gateway ativo via `gateway_key`.
- **C3/D3/D5/E1/E2**: motor + **Fase 9** (regras documentadas, flags `BILLING_*`, logs).
- **G1/G2 (Fase 6)**: PIX na tela + fallback gateway + polling de status; cartão continua redirect.

## 5. Riscos identificados

### Riscos de compatibilidade/produção
- **Alto (mitigado em código)**: `getCustomerInvoiceSchema()` evita 500 sem colunas da 80/81; sem migração, recursos avançados **não persistem** — ver `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md`.
- **Médio**: B4 com filtro local em lista limitada pode induzir falsa percepção de “cobrança inexistente”.
- (reduzido) A1 alinhado a provedor ativo (V2).
- **Médio**: evoluções futuras (cartão embutido, novo gateway) exigem estender H1–H4 por provedor.
- **Baixo**: branding público com `logo_url` externo depende de disponibilidade/qualidade da URL.

### Desvios do plano
- Plano marca fases como concluídas onde há itens explicitamente parciais (3, 5, 6 em parte).
- Fase 5 foi iniciada com base estrutural (correto), porém sem plano operacional de rollout (migração + feature flag + monitoramento).

## 6. Próximas fases recomendadas
1. **Fase 8 — Consolidação de consistência e risco** — 🟢 **entregue (base)**  
   - B4: busca server-side + telefone + UX; limite 100.  
   - Stubs H1 (Fase 6) + H2–H4 (`docs/H2-H3-H4-FASE8-STUBS.md`).  
   - Checklist migrações 80 e 81 (§8).  
   - Evolução opcional: paginação `offset` na UI, telemetria G1/G2.
2. **Fase 9 — Recorrência por item controlada** — 🟢 **entregue (base)**  
   - Regras D3/D5/E1/E2 em `docs/FASE9-RECORRENCIA-POR-ITEM.md`.  
   - Flags `BILLING_CHILD_ITEM_INVOICES_ENABLED` / `BILLING_CHILD_BATCH_LIMIT` (`docs/ENV-BILLING.md`).  
   - Logs `child_batch_summary` + idempotência já documentada (índices + keys).  
   - Evolução: métricas Prometheus, testes de carga, D4 “fatura inteira diária” se produto pedir.
3. **Fase 10 — Pagamento público avançado** — 🟢 **entregue (sem G3)**  
   - Metadados de payload + telemetria opcional + UX/polling (`FASE10-PAGAMENTO-PUBLICO-AVANCADO.md`).  
   - **G3** (multi-gateway/opção na mesma fatura) permanece **pendente** de decisão de produto.
4. **Etapa 11 — Operação e qualidade** — 🟢 **entregue (base)**  
   - `docs/FASE11-OPERACAO-E-QUALIDADE.md` (rollout 80/81, env, workers, aceite, backlog).  
   - Testes Vitest: `packages/backend/src/services/publicPayPayloadMeta.test.ts`.

## 7. Sugestões de melhoria
- ~~Criar matriz de rollout por fase~~ → **Etapa 11** (`FASE11-OPERACAO-E-QUALIDADE.md`); expandir com monitoramento/rollback por tenant se necessário.
- Adicionar testes de contrato para payload público (`payment_urls`, `tenant_branding`).
- Adicionar testes E2E para:
  - criação de fatura por link,
  - fluxo PIX inline,
  - histórico de recorrência no detalhe.
- Incluir no plano um bloco “critérios de aceite por fase” com checks técnicos e de negócio.

## 8. Checklist operacional — Migração 80 (obrigatório em produção)
1. **Pré-deploy**: garantir `database/init/80_customer_invoice_items_advanced_schedule.sql` presente e incluída no `migrate.ts`.
2. **Janela de deploy**: rodar migração antes de subir nova versão do backend que lê/escreve `is_recurring`, `recurring_interval`, `scheduled_due_date`.
3. **Validação rápida SQL**:
   - `SELECT is_recurring, recurring_interval, scheduled_due_date FROM customer_invoice_items LIMIT 1;`
4. **Smoke test funcional**:
   - criar fatura com item normal e item com opções avançadas;
   - confirmar `GET /api/customer-invoices/:id` retornando os campos sem erro.
5. **Monitoramento pós-deploy (30-60 min)**:
   - erros 500 em `POST /api/customer-invoices`;
   - logs de SQL “column does not exist”.
6. **Rollback tático**:
   - se backend novo falhar por schema, voltar versão da aplicação imediatamente e manter migração (aditiva, sem perda).

## 9. Checklist operacional — Migração 81 (E2 pai↔filha)
1. **Pré-deploy**: `database/init/81_customer_invoice_parent_child_e2.sql` no `migrate.ts` (após 80).
2. **Janela**: rodar migração antes do backend que usa `parent_invoice_id`, `parent_invoice_item_id`, `invoice_type='child'`.
3. **SQL rápido:** `SELECT parent_invoice_id, invoice_type FROM customer_invoices WHERE id = $id;`
4. **Smoke:** worker (`processChildItemDueInvoices`) + criação de fatura recorrente sem colidir no índice único `(subscription_id, period_start)` para filhas.
5. **Rollback:** reverter app; migração 81 é aditiva (colunas nullable) — avaliar `DROP INDEX`/`ALTER` só em plano de emergência.
