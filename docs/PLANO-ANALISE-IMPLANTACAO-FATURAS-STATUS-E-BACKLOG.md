# Análise do plano — Faturas e Financeiro (status + backlog)

**Referências:**  
- `PLANO-EVOLUCAO-FATURAS-E-FINANCEIRO.md` (plano estratégico original)  
- `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` (continuidade A–H, fases 8–11)

**Objetivo deste documento:** confirmar item a item o que **já está implantado** no código, o que está **parcial**, e listar um **plano de ação** para fechar lacunas e ajustes.

**Data da análise:** 2025-02-25 (revisão por leitura de código e docs).

---

## Parte A — Plano estratégico (`PLANO-EVOLUCAO-FATURAS-E-FINANCEIRO.md`)

### A.1 Seção 1 — “Estado atual” (documento histórico)

O §1 descrevia o estado **antes** da evolução. Hoje está **superado**: `customer_invoice_items` existe, há gateway genérico, página de criação dedicada, etc. **Não há ação** além de arquivar que o doc-base é histórico.

| Trecho do §1 | Situação atual |
|----------------|----------------|
| Dois sistemas (`customer_invoices` vs `invoices`) | **Mantido por desenho** (cobrança gateway vs financeiro interno) |
| `customer_invoices` sem itens por linha | **Obsoleto** — há `customer_invoice_items` (+ migrações 76/80/81) |

---

### A.2 Ponto 1 — Menus e “Financeiro completo” (§2)

| Item do plano | Status | Evidência / notas |
|-----------------|--------|-------------------|
| Remover/evitar página vazia “Faturamento” | **Implementado** | Rota `/billing` → `<Navigate to="/customer-invoices" />` (`App.tsx`). Sidebar **não** expõe mais item “Faturamento” isolado. |
| Opção A — um único “Financeiro” com abas (faturas cobrança + despesas + relatório) | **Não implementado como descrito** | Mantida a **Opção B**: itens **“Faturas de clientes”** (`/customer-invoices`) e **“Financeiro”** (`/finance`) no grupo Financeiro (`AppLayout`). |
| Opção B — dois itens no menu | **Implementado** | Conforme acima. |
| Relatório com receitas de **customer_invoices pagas** + despesas | **Implementado** | `GET /api/finance/billing-receipts` + `Finance.tsx` / `FinancialSummary.tsx` (`billingReceipts`). |
| Incluir também **invoices** (tabela finance) no resumo | **Implementado** | Aba/resumo usa faturas internas + `billingReceipts`. |
| Ajustar `AppLayout` / `RequireModuleView` / features | **Implementado** | Módulos `billing` / `finance` conforme rota. |

**Conclusão Ponto 1:** funcionalmente alinhado ao objetivo (sem placeholder, relatório unificado de receitas). **Decisão de produto pendente (opcional):** migrar para Opção A (uma rota `/finance` com sub-abas incluindo lista de faturas de cobrança) se quiser reduzir entradas de menu.

---

### A.3 Ponto 2 — Faturas de clientes robustas (§3)

| Melhoria (§3.2) | Status | Notas |
|-------------------|--------|--------|
| Página única de criação (não só modal) | **Implementado** | `/customer-invoices/new` (`CustomerInvoiceNew.tsx`). |
| Fatura recorrente | **Implementado** | Fluxo com `subscription` + billing engine (ver também Fase 9 no doc de continuidade). |
| Itens (linhas, descontos) | **Implementado** | `customer_invoice_items`; migrações 76 + 80 (campos avançados). |
| Produtos/serviços do catálogo | **Implementado** | Seleção por produto na criação. |
| Formas de pagamento na fatura | **Implementado** | PIX/boleto/cartão conforme gateway; ver limitações C2 abaixo. |
| Aviso no topo + atalho configurar gateway | **Implementado** | Gateway status + UX em listagem/nova fatura (itens A1 etc. no doc de continuidade). |
| Dados do cliente + CPF editável | **Implementado / parcial UX** | B3 marcado como parcial no doc de continuidade (padronização). |
| Link único de pagamento | **Implementado** | Fluxo público `CustomerInvoicePay` + API pública. |
| Fatura “não cliente” (sem cliente inicial) | **Implementado** | `client_id` nullable + fluxo por link (`customerInvoices.ts` / backend). |
| Cancelar/excluir no gateway ao cancelar fatura | **Implementado** | `gateway.cancelPayment` no cancelamento (`customerInvoicesController`). |
| `notificationEnabled: false` (Asaas) | **Implementado** | `asaasMapper` / tipos (`notificationEnabled`). |

**Tabela de fases §3.4 (2.1–2.8)**

| Fase | Status |
|------|--------|
| 2.1 Página única + aviso Asaas | **OK** |
| 2.2 CPF / dados cliente | **OK** (refino B3 opcional) |
| 2.3 Itens | **OK** |
| 2.4 Produtos | **OK** |
| 2.5 Link único | **OK** |
| 2.6 Recorrente + worker | **OK** |
| 2.7 Sem cliente | **OK** |
| 2.8 Sync + notificações | **OK** |

---

### A.4 Ponto 3 — Cobrança / “charges” (§4)

| Item | Status | Notas |
|------|--------|--------|
| Entidade `customer_charges` + `charge_id` em `customer_invoices` | **Implementado** | Migração `79_customer_charges.sql`; CRUD e listagens. |
| CRUD + listagem com resumo (faturas, valores) | **Implementado** | `customerChargesService.ts`, páginas `CustomerCharges` / `CustomerChargeDetail`. |
| Vincular fatura à cobrança na criação | **Implementado** | `charge_id` no POST de fatura + UI. |
| Regra ao marcar fatura paga → recalcular cobrança | **Implementado** | `recalculateChargeStatus` no webhook (`paymentDomainService`). |

**Desvio em relação ao texto original do §4.2:** o plano citava **`total_amount_cents`** na cobrança e quitado quando **soma paga ≥ total**. O modelo implantado **não** guarda valor-alvo na cobrança: o status é derivado como **nenhuma / algumas / todas** as faturas vinculadas pagas.  
→ Classificação: **parcial vs documento estratégico**, **completo vs implementação atual**.

---

### A.5 Checklist de decisões (§6)

| Decisão | Situação no código |
|---------|---------------------|
| Menu A vs B | **B** (dois itens) em uso; A não obrigatória. |
| Itens: tabela vs JSONB | **Tabela** `customer_invoice_items`. |
| `client_id` nullable | **Sim.** |
| Cobrança com tabela + `charge_id` | **Sim** (sem `total_amount_cents` no schema atual). |
| Parâmetro Asaas notificações | **Tratado** (`notificationEnabled`). |
| DELETE payment | **Via cancelamento** no gateway (Asaas `deletePayment` no serviço). |

---

## Parte B — Plano de continuidade (`PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md`)

Este arquivo já contém uma **matriz A1–H4** com status. Abaixo: **síntese** + itens que seguem **abertos** para o backlog.

### B.1 Confirmado como não implementado ou só documento

| ID | O que é | Status no doc | Confirmação |
|----|---------|---------------|---------------|
| **C2** | Vários métodos de pagamento na mesma cobrança (fluxo completo) | Não implementado | Mantém-se: depende de decisão / possível H1. |
| **D2** | (Definido no doc como opcional / documento) | Não implementado | Aceito como fora de escopo até decisão. |
| **D4** | Recorrência **diária** para a fatura inteira | Não implementado | Só granularidade por item (base); execução diária “fatura inteira” não existe. |
| **G3** | Cards multi-gateway / escolha na mesma fatura (checkout avançado) | Não implementado | Fase 10 entregue sem G3. |

### B.2 Parcial / evolução contínua

| ID | Tema | Ação típica |
|----|------|-------------|
| **B3** | `ClientSearchCombobox` | Padronizar em mais fluxos. |
| **H1–H4** | Estudos checkout / PCI / webhooks / worker | Expandir docs e testes quando houver cartão embutido ou multi-gateway. |
| **G1/G2** | Payload PIX / polling | Telemetria e fallbacks por gateway (já parcialmente entregues nas fases 6/10). |

### B.3 Operação (migrações 80 / 81)

O doc §8–§9 permanece **válido**: backend que insere/seleciona colunas da migração **80** e **81** deve rodar **após** SQL aplicado; há detecção em `customerInvoiceSchema` para compatibilidade, mas **rollout em produção** exige checklist (Fase 11).

---

## Parte C — Plano de implantação e ajustes (backlog priorizado)

Use esta lista para **implantar o que falta** e **alinhar produto ao plano estratégico** onde ainda há desvio.

### Prioridade alta (consistência e risco)

1. **Rollout migrações 80 e 81 em todos os ambientes**  
   - Garantir `migrate.ts` + execução em staging/prod **antes** de deploy que depende das colunas.  
   - Monitorar 500 em `POST /api/customer-invoices` e erros SQL (ver `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` §8–9).

2. **Cobrança (`customer_charges`) vs plano §4.2**  
   - **Decisão de produto:** manter modelo atual (status por “todas as faturas pagas”) **ou** evoluir para `total_amount_cents` + regra “soma paga ≥ total”.  
   - Se evoluir: migration + UI de criação de cobrança com valor-alvo + ajuste em `recalculateChargeStatus`.

3. **Testes de contrato / smoke**  
   - Testes do payload público (`payment_urls`, `tenant_branding`) e E2E sugeridos no doc de continuidade §7.

### Prioridade média (produto e UX)

4. **Opção A de menu (opcional)**  
   - Unificar em `/finance` com abas: Cobrança ao cliente | Despesas | Resumo (reduzindo duas entradas).  
   - Ou manter B e apenas melhorar copy/navegação.

5. **B3 — Padronizar busca de cliente**  
   - Reutilizar `ClientSearchCombobox` (ou componente único) nos fluxos que ainda usam padrões antigos.

6. **C2 / G3**  
   - Workshop de requisitos: múltiplos métodos na mesma cobrança e multi-gateway na UI pública; depende de limitações dos gateways.

7. **D4 — Recorrência diária (fatura inteira)**  
   - Só se negócio exigir: estender subscription/worker (hoje foco mensal+ e itens).

### Prioridade baixa

8. **H1–H4** — Formalizar quando houver escopo de cartão embutido ou matriz gateway×modo.

9. **Acessibilidade e microcopy** na página pública de pagamento (já citado no doc de continuidade).

10. **Padronizar textos** (“gateway configurado e testado” vs “ativo”) em toda a UI.

---

## Parte D — Resumo executivo

| Área | Cobertura |
|------|-----------|
| Faturas de clientes (itens, produtos, link, recorrência, nullable client, gateway, notificações Asaas) | **Alta** — alinhado ao plano estratégico. |
| Financeiro (receitas `customer_invoices` + `invoices` + despesas) | **Alta.** |
| Menu “Faturamento” placeholder | **Resolvido** (redirect). |
| Menu tipo Opção A única | **Não** — vigente Opção B. |
| Cobranças agrupadas | **Implementado** com modelo **simplificado** (sem valor-alvo na tabela). |
| Itens C2, G3, D4 (fatura diária), H completos | **Pendentes / parciais** conforme doc de continuidade. |

---

*Gerado para apoiar decisão de roadmap; atualizar este arquivo após mudanças de schema ou de escopo de produto.*
