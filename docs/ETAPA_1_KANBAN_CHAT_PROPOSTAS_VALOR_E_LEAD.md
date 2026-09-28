# Etapa 1 — Kanban do chat × Propostas (valor comercial e lead)

Esta etapa fecha a **base segura** para usar **propostas** como fonte de valor no kanban do chat, com suporte a **cliente** e **lead**, configuração por coluna e exibição compacta nos cartões. Não inclui automação de mover cartão, modelo de proposta por coluna nem envio automático.

## 1. Proposta para cliente e para lead

- **Modelagem:** tabela `proposals` ganhou `lead_id` (FK para `leads`), com **exatamente um** entre `client_id` e `lead_id` (CHECK no banco).
- **Migration:** `database/init/126_proposals_lead_id.sql` (registrada em `packages/backend/src/migrate.ts`).
- **Backend:** `proposalsController` valida criação/alteração (XOR cliente/lead, tenant), listagem e detalhe com `lead_id` / `lead_name`; criação rejeita se ambos ausentes.
- **Frontend:** tipos em `src/services/proposals.ts` (`lead_id`, `lead_name`, filtro `lead_id`); formulário e API enviam o vínculo correto.

**Regra de produto:** não misturar `lead.id` em `client_id`. Se o utilizador escolher cliente no formulário, o vínculo com lead é limpo (prioridade cliente).

## 2. Criação de proposta no chat (e leads)

- **`Chat.tsx`:** passa `initialClientId` quando a conversa tem `client_id`; caso contrário passa `initialLeadId` (`leadId` da conversa) e `initialLeadName` para contexto.
- **`ProposalCreateForm`:** estado `leadId`, `handleClientChange` limpa lead ao selecionar cliente; validação exige cliente **ou** lead; payload inclui `client_id` e/ou `lead_id` conforme XOR.
- **`Leads.tsx`:** se o lead tem `migrated_client_id`, pré-preenche cliente; senão pré-preenche `initialLeadId` com o id do lead.

## 3. Configuração da coluna — chaves de propostas

- **Metadata:** `metadata.kanban_proposals` com `show_pending` e `show_accepted` (booleanos independentes).
- **UI:** `ChatKanbanColumnSettingsSheet.tsx` (secção Propostas), helpers em `kanbanColumnRulesUi.ts` (`parseKanbanProposalsDisplay`, `mergeKanbanProposalsIntoMetadata`).
- **Backend:** `kanbanProposalsMetadata.ts` + sanitização ao criar/patch de coluna em `chatKanbanController`.

**Comportamento:** só pendentes / só aceites / ambos / nenhum (nenhum ⇒ sem bloco de valores no cartão).

## 4. Regra de cálculo (pendente / aceita)

Centralizada na agregação SQL do kanban (`chatKanbanController` — `LEFT JOIN LATERAL` sobre `proposals`):

| Status      | Pendente | Aceita |
|------------|----------|--------|
| `draft`    | não      | não    |
| `sent`     | **sim**  | não    |
| `accepted` | não      | **sim**|
| `rejected` | não      | não    |
| `expired`  | não      | não    |
| `invoiced` | **não**  | **não**|

**Política para `invoiced` (esta etapa):** fora das duas somas para evitar dupla contagem com `accepted` e manter o cartão simples.

**Contexto do cartão:** se a conversa tem `conv_client_id`, agrega por `client_id`; senão, se tem lead, por `lead_id` — sem misturar.

## 5. Exibição no cartão do kanban

- **`ChatKanbanBoardColumn`** passa `column.metadata` ao cartão; **`ChatKanbanPage`** no `DragOverlay` resolve a metadata pela coluna do cartão ativo.
- **`ChatKanbanCard`:** lê `parseKanbanProposalsDisplay(columnMetadata)` e totais `proposal_pending_total` / `proposal_accepted_total`; mostra linhas compactas “Pendente: R$ …” / “Aceita: R$ …” quando a coluna permite e há cliente ou lead na conversa.

## 6. Faturamento

- **`proposalInvoiceConversionService`** continua a exigir `client_id` na proposta para converter em fatura.
- Proposta **somente com `lead_id`** não gera fatura diretamente; no formulário, **“Gerar fatura pendente automaticamente”** após aceite fica indisponível quando só há lead.

## 7. Riscos remanescentes

- Conversão lead → cliente e reassociação de propostas é fluxo futuro; hoje propostas antigas do lead permanecem em `lead_id` até migração manual se necessário.
- Timeline CRM na criação de proposta no chat continua ligada a eventos de **cliente** quando há `client_id`; proposta só-lead não grava esse evento (comportamento pré-existente alinhado a faturamento).

---

## Checklist de aceite

- [ ] Proposta pode ser criada para cliente
- [ ] Proposta pode ser criada para lead
- [ ] `lead_id` não foi misturado com `client_id`
- [ ] Coluna possui chave para propostas pendentes
- [ ] Coluna possui chave para propostas aceitas
- [ ] Cartão do kanban mostra valores conforme as chaves ligadas
- [ ] Regra de cálculo de pendente e aceita ficou documentada
- [ ] Faturamento continua exigindo cliente válido
