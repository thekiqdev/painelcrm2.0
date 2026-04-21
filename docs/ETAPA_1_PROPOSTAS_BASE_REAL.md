# Etapa 1 — Propostas / Orçamentos: base real

Objetivo: remover mocks principais, alinhar dashboard e links, reforçar permissões de leitura no backend e preparar vínculo futuro com faturas — **sem** implementar conversão completa para fatura.

---

## O que foi alterado

### 1. Listagem `/proposals` com API real

- `Proposals.tsx` passou a usar `proposalsService.getProposals` com filtro por aba (`status` ou todas).
- Formulário “Nova proposta” cria registro via `createProposal` (cliente, valor, validade, funil/estágio opcionais, descrição).
- Cards exibem dados reais; ações **Abrir** / **Editar / status** navegam para `/proposals/:id`.
- Exclusão condicionada a `canDeleteRecord('proposals', owner, user)`.
- Botão **Nova proposta** respeita `canCreate('proposals')`.

### 2. Funil com propostas reais (somente fluxo `proposals`)

- `useFunnelData.ts`: removido array fixo de deals; carrega `getProposals()` + clientes e monta `Deal[]` via `mapProposalsToDeals` (utilitário novo).
- `FunnelDetails.tsx`: quando `funnel.type === 'proposals'`, carrega `getProposals({ funnel_id })`, mapeia para o Kanban/lista; cliques abrem `/proposals/:id`.
- Tipos **clients** / **leads** / **contracts** no funil não foram refatorados; para não-propostas, `deals` permanece vazio (comportamento honesto em relação ao mock anterior).

### 3. KPI do dashboard

- `dashboardController.ts`: contagem mensal de “propostas” passou a usar a tabela `proposals` (join por `user_id` / tenant), em vez de `contracts`.

### 4. Link Chat ↔ detalhe

- Já era gerado `.../proposals/${proposal.id}`; foi adicionada rota explícita **`/proposals/:proposalId`** em `App.tsx` com o mesmo `ProposalDetails` usado no caminho pelo funil.

### 5. Permissões

**Backend**

- `GET /api/proposals` e `GET /api/proposals/:id`: `assertModulePermission(..., 'proposals', 'view', ...)`.
- `GET /api/proposals` exige usuário autenticado quando há `tenantId` (resposta `401` se ausente).
- Respostas passam a incluir `user_id` (criador) para o front aplicar *own* em edição/exclusão/aceite.

**Frontend**

- `ProposalDetails`: Aceitar/Recusar só aparecem se `canEditRecord('proposals', proposal.user_id, user.id)` e status ainda não for `accepted` / `rejected`.
- Voltar: se veio do funil (`funnelId` na rota), retorna ao funil; senão, para `/proposals`.

**Lacunas documentadas (fases futuras)**

- Ações específicas `send`, `convert_to_invoice`, `approve` ainda **não** existem no permission engine — hoje usam-se `view` / `create` / `edit` / `delete` (com `edit_own_only` / `delete_own_only` onde aplicável).

### 6. Preparação para fatura (schema apenas)

- Nova migration `database/init/118_customer_invoices_proposal_id.sql`: coluna nullable `customer_invoices.proposal_id` referenciando `proposals(id)` com `ON DELETE SET NULL`, índice parcial.
- Entrada correspondente em `packages/backend/src/migrate.ts`.
- **Nenhuma** lógica de `createManualInvoice` ou preenchimento automático nesta etapa.

---

## Arquivos impactados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Proposals.tsx` | Lista e criação reais; permissões; filtros por aba. |
| `src/pages/ProposalDetails.tsx` | Rotas `/proposals/:id` e funil; `goBack`; permissões nos botões de status. |
| `src/hooks/useFunnelData.ts` | Deals a partir da API de propostas. |
| `src/pages/FunnelDetails.tsx` | Carga de propostas por funil; navegação para detalhe. |
| `src/utils/proposalsToFunnelDeals.ts` | **Novo** — mapeamento Proposal → Deal do funil. |
| `src/services/proposals.ts` | Tipo `Proposal` com `user_id` opcional. |
| `src/App.tsx` | Rota `GET` visual `/proposals/:proposalId`. |
| `packages/backend/src/controllers/proposalsController.ts` | `view` + `user_id` no SELECT; tratamento `ModulePermissionError` em GET. |
| `packages/backend/src/controllers/dashboardController.ts` | KPI de propostas na tabela correta. |
| `database/init/118_customer_invoices_proposal_id.sql` | **Novo** — coluna preparatória. |
| `packages/backend/src/migrate.ts` | Inclusão do SQL 118. |
| `docs/ETAPA_1_PROPOSTAS_BASE_REAL.md` | Este documento. |

---

## Checklist final

- [x] `Proposals.tsx` usa API real  
- [x] Funil (tipo `proposals`) usa propostas reais  
- [x] KPI de proposals usa fonte correta (`proposals`, não `contracts`)  
- [x] Chat / notificação alinha com rota `/proposals/:id` existente  
- [x] Permissões atuais revisadas (`view` no GET; UI alinhada a `create` / `edit` / `delete`)  
- [x] Base preparada para conversão (`proposal_id` em `customer_invoices`)  

---

## Riscos remanescentes

1. **Funis leads/contracts**: Kanban continua sem dados reais de “deals” (só propostas foram ligadas nesta etapa).  
2. **Propostas sem `funnel_id`**: não entram na contagem por funil nem no board daquele funil.  
3. **Registros legados sem `user_id` na API**: improvável no schema atual; se ocorrer, botões de aceite podem ficar ocultos até correção de dados.  
4. **Migration 118**: aplicar em produção no momento do deploy (runner de `migrate` ou processo interno).  

---

## Pronto para a Etapa 2?

**Sim.** Com listagem, funil de propostas, KPI e links coerentes, e coluna `proposal_id` disponível, a próxima etapa pode focar em **regras de transição**, **endpoint de conversão** e **preenchimento controlado** da fatura a partir da proposta aceita — sem reabrir a base mockada.
