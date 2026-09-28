# Dashboard — Permissões e Blocos Operacionais

## Objetivo

Evoluir o dashboard inicial para um centro de comando operacional, com blocos úteis por perfil e visibilidade condicionada por permissões de módulo, sem alterar regras de negócio dos domínios.

## Escopo implementado

- Vinculação de blocos e atalhos do dashboard às permissões reais do frontend (`canView`, `canCreate`, `canEdit`).
- Substituição do card de alertas por card de **Contas a pagar (próximos 7 dias)**.
- Inclusão de atalhos financeiros de ação rápida:
  - `Lançar entrada`
  - `Lançar despesa`
  - `Transferir`
- Inclusão/melhoria de blocos operacionais:
  - `Tarefas`
  - `Projetos`
  - `Conversas`
  - `Próximos 7 dias` (a receber, a pagar, saldo previsto)
- Evolução do payload de `GET /api/dashboard/overview` com dados agregados para os novos blocos.

## Permissões usadas

> Observação: o projeto usa IDs de módulo (`billing`, `finance`, `projects`, etc.), então o dashboard respeita esses nomes reais.

- `dashboard`: bloco de indicadores executivos.
- `finance`: contas a pagar, próximos 7 dias (parte financeira), atalhos de entrada/despesa/transferência.
- `billing`: próximas receitas (próximos 7 dias), cards e atalhos de cobrança/faturas.
- `tasks`: bloco de tarefas.
- `projects`: bloco de projetos.
- `chat`: bloco de conversas e atalho de resposta.
- `clients`, `leads`, `tickets`, `proposals`, `contracts`: mantidos nos blocos e atalhos existentes com visibilidade condicional.

## Fontes de dados por bloco

- **Contas a pagar (7 dias)**
  - `financial_transactions` (`expense`, `pending`, não transferência)
  - `financial_recurring_expense_occurrences` (`planned`/`pending`)
- **Próximos 7 dias**
  - Recebíveis: `customer_invoices` (`pending`/`overdue`)
  - Pagáveis: agregação do bloco de contas a pagar
- **Tarefas**
  - `tasks` (priorizando usuário logado via `assignee_id`/`user_id`, com classificação em atrasadas, hoje, próximas, recentes)
- **Projetos**
  - `projects` ativos vinculados ao usuário (dono ou presente em `responsible_ids`)
  - Apoio de `project_tasks` para contagem de pendências
- **Conversas**
  - `chat_conversations` (ativas, aguardando, não lidas + lista curta)

## Regras de visibilidade

- Bloco inteiro some quando usuário não tem permissão de visualização do módulo.
- Atalhos financeiros de criação só aparecem com permissão de edição/criação financeira.
- Bloco `Próximos 7 dias` aparece quando há visibilidade de `finance` e `billing`.

## Comportamento mobile

- Dashboard mobile segue ordem operacional:
  1. Atalhos rápidos
  2. Indicadores
  3. Contas a pagar
  4. Próximos 7 dias
  5. Tarefas
  6. Conversas
  7. Blocos já existentes de operação/base
- Estados vazios com copy direta:
  - `Nenhuma conta a vencer nos próximos 7 dias.`
  - `Nenhuma tarefa urgente.`

## Endpoint evoluído

- `GET /api/dashboard/overview` passou a retornar também:
  - `accounts_payable_next_7_days`
  - `accounts_payable_total_cents`
  - `next_7_days`
  - `tasks_overview`
  - `projects_overview`
  - `chat_overview`

## Arquivos impactados

- `packages/backend/src/controllers/dashboardController.ts`
- `src/services/dashboard.ts`
- `src/pages/Dashboard.tsx`
- `src/pages/finance/FinancialUnifiedTransactionsPage.tsx`
- `src/pages/finance/FinancialUnifiedAccountsPage.tsx`
- `docs/DASHBOARD_PERMISSOES_E_BLOCOS_OPERACIONAIS.md`

## Critérios de aceite atendidos nesta entrega

- Blocos respeitam permissões de módulo no frontend.
- `Atenção necessária` substituído por `Contas a pagar`.
- `Contas a pagar` exibe próximos 7 dias com total.
- Atalhos `Lançar entrada`, `Lançar despesa` e `Transferir` adicionados e funcionais.
- Blocos de tarefas, projetos e conversas com conteúdo útil e estado vazio.
- Bloco `Próximos 7 dias` implementado.
- Dashboard mobile permanece limpo e operacional.

## Limitação conhecida

- A visibilidade está protegida no frontend por permissões de módulo já existentes; o backend do overview retorna payload agregado e pode ser endurecido em rodada futura para filtragem por permissão no servidor campo a campo.
