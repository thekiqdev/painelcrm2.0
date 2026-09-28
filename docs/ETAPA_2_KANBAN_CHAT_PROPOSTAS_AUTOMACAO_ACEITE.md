# Etapa 2 — Kanban do chat × Propostas (automação ao aceitar)

Quando uma proposta passa a status **`accepted`**, o sistema pode **mover automaticamente** o cartão da conversa para outra coluna do **mesmo quadro**, conforme a configuração da **coluna em que o cartão está no momento do aceite**.

A Etapa 1 (valor no card, `lead_id`, chaves de exibição) permanece; esta etapa **não** inclui modelo de proposta por coluna, envio automático de proposta nem automações além deste movimento.

## 1. Configuração da coluna (`metadata.kanban_proposals`)

| Chave | Tipo | Descrição |
|--------|------|-----------|
| `show_pending` / `show_accepted` | boolean | Etapa 1 — totais no cartão |
| `move_on_proposal_accept` | boolean | Se verdadeiro, ao aceitar proposta o backend tenta mover o cartão que estiver **nesta** coluna |
| `target_column_id` | UUID (string) | Coluna de destino no **mesmo** `board_id` |

Validação ao gravar coluna (API): com automação ligada é obrigatório destino válido no quadro; destino **≠** coluna atual; reutiliza o conjunto de IDs de colunas do board.

## 2. Disparo da automação

- **Painel (PATCH `/api/proposals/:id`)**: após `UPDATE` com transição para `accepted`, se `tenantId` existir, chama `runProposalKanbanAcceptAutomation` com `acceptanceSource: 'panel'`.
- **Link público (POST aceite)**: após o `UPDATE` que só afeta linhas `status = 'sent'` e hooks existentes, chama o mesmo serviço com `acceptanceSource: 'public_link'`.

Não há polling: o gatilho é a transição real para `accepted` (idempotência natural do UPDATE público em caso de repetição).

## 3. Localização do(s) cartão(ões)

- Procura `chat_kanban_cards` **não arquivados** do tenant, com `chat_conversations` onde:
  - se a proposta tem **`client_id`**: `cc.client_id` = proposta;
  - se tem **`lead_id`**: `cc.lead_id` = proposta (nunca mistura os dois na mesma proposta).

**Vários cartões:** pode existir um cartão por **quadro** para a mesma conversa (`UNIQUE (board_id, conversation_id)`). A automação processa **cada** cartão encontrado: só move se **a coluna atual** daquele cartão tiver `move_on_proposal_accept` e destino válido.

**Regra de segurança:** não move se o cartão já está na coluna destino, se a coluna destino não existe ou não pertence ao mesmo board, ou se a automação na coluna de origem estiver desligada após releitura no servidor.

## 4. Idempotência

- **Aceite duplicado:** o fluxo público não atualiza duas vezes (`status` já não é `sent`).
- **Por cartão e proposta:** antes de mover, verifica na timeline da proposta se já existe evento `proposal_kanban_moved_on_accept` com o mesmo `card_id` no payload; se existir, **não** repete o movimento.

## 5. Registro / auditoria

- **Timeline da proposta:** evento `proposal_kanban_moved_on_accept` com `card_id`, `conversation_id`, `board_id`, `from_column_id`, `to_column_id`, `acceptance_source`, `automation`.
- **WebSocket:** `emitConversationUpdatedToTenant(tenantId, { id: conversation_id })` para os clientes na sala `tenant:{id}` refetcharem o Kanban (alinhado ao hook que já escuta `conversation_updated`).

## 6. Execução técnica do movimento

Reutiliza o mesmo pipeline de entrada/saída de coluna que o PATCH manual do cartão (`applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate`, `runKanbanDestColumnPostUpdateAutomations`), agendamento de movimento por tempo, cancelamento de agendamentos pendentes ao sair da coluna, e `runKanbanPhase2Automations` após commit. Motivo registrado no fluxo: `Proposta aceita (automação Kanban)`.

Ator RLS: `proposals.user_id` (dono da proposta).

## 7. Cliente e lead

- Funciona para proposta com **cliente** ou **lead**, desde que a conversa do cartão tenha o mesmo vínculo.
- **Faturamento** não é alterado nesta etapa (`proposalInvoiceConversionService` inalterado).

## 8. Riscos remanescentes

- Concorrência rara: dois pedidos simultâneos no mesmo aceite podem, em teoria, disputar o mesmo cartão; a timeline por `card_id` reduz duplicação na prática.
- Colunas com `require_confirmation` no **destino**: o movimento automático usa o pipeline interno (como o worker de movimento por tempo), sem confirmação humana — mesmo comportamento esperado para automações de sistema.

---

## Checklist de aceite

- [ ] Coluna possui opção de mover cartão ao aceitar proposta
- [ ] Coluna permite escolher destino
- [ ] Proposta aceita pode mover card automaticamente
- [ ] Automação não roda em loop nem duplica movimento (idempotência por timeline)
- [ ] Funciona para cliente
- [ ] Funciona para lead
- [ ] Movimento fica rastreável (timeline)
- [ ] Etapa 1 continua preservada
