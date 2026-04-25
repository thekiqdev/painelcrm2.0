# Dashboard Executivo Geral

## Objetivo

Transformar o dashboard inicial em um painel executivo para tomada de decisão rápida do dono da empresa, com visão integrada de vendas, funil, operação, clientes, financeiro e alertas.

## Blocos implementados

1. **Topo de performance**
   - Receita recebida
   - Receita futura
   - Taxa de conversão
   - Ticket médio

2. **Vendas e previsão**
   - Gráfico mensal com receita recebida e receita prevista (padrão do financeiro).

3. **Funil de vendas**
   - Lista por etapa com:
     - nome real da etapa
     - quantidade de cards/leads
     - valor estimado (quando disponível)
     - percentual de distribuição

4. **Atendimento e operação**
   - Leads sem resposta
   - Tickets abertos
   - Tarefas vencidas
   - Tarefas que vencem hoje

5. **Clientes**
   - Clientes ativos
   - Novos clientes no período
   - Clientes com assinatura ativa
   - Clientes com fatura vencida

6. **Financeiro resumido**
   - Receita recebida
   - Receita futura
   - Despesas
   - Resultado previsto
   - Caixa disponível

7. **Alertas inteligentes**
   - Faturas vencidas
   - Resultado previsto negativo
   - Leads parados
   - Tickets atrasados
   - Tarefas vencidas
   - Estado vazio positivo: "Tudo certo por enquanto."

## Endpoint consolidado

- `GET /api/dashboard/overview`
- Query:
  - `preset=current_month|last_month|ytd`
  - `from`, `to` (opcional)

## Fontes de dados

- **Receita/financeiro**
  - `getFinancialEnterpriseReport(...)`
  - `customer_invoices` pagas e pendentes
  - `subscriptions_projection` (projeção de assinatura)
- **Funil**
  - `clients.funnel_stage` + `funnel_stages`
- **Operação**
  - `leads`, `tickets`, `tasks`
- **Clientes**
  - `clients`, `subscriptions`, `customer_invoices`

## Fórmulas usadas

- `conversion_rate = leads_converted / leads_created`
- `average_ticket = received_revenue / paid_sales_count`
- `result_projected = income_received + income_projected - expense_paid - expense_projected`
- `cash_available = sum(by_account.estimated_balance)`

## Fallbacks

- Sem tenant: retorna `401` com erro claro.
- Dados ausentes:
  - usa `0` para métricas numéricas;
  - `average_ticket` usa `null` quando não há vendas pagas;
  - listas vazias rendem estados vazios amigáveis no frontend.

## Compatibilidade e regras

- Rotas antigas de dashboard foram mantidas.
- Nenhuma mudança no motor de faturas, assinaturas ou financeiro.
- Implementação focada em leitura/agregação.
- Dashboard permanece tenant-scoped.

## Critérios de aceite cobertos

- Carregamento estável sem erro.
- Receita recebida e futura separadas.
- Conversão e ticket médio com fallback.
- Funil com nomes reais de etapas.
- Bloco de alertas com estado positivo quando não há riscos.
- Financeiro resumido integrado.
- Layout responsivo com hierarquia executiva.
