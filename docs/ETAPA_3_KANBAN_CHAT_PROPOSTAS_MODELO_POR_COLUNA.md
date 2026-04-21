# Etapa 3 — Kanban do chat × Propostas: modelo padrão por coluna

## Objetivo

Permitir que cada coluna do Kanban tenha um **modelo padrão de proposta** (um rascunho existente do módulo Propostas). Ao iniciar a criação a partir do cartão, o **fluxo lateral do Chat** reaproveita o formulário atual e **pré-preenche** com os dados desse rascunho. O utilizador **revisa e confirma** (criação/envio); **não há envio automático cego** nesta etapa.

## Configuração na coluna

- Em **Chat Kanban → Definições da coluna → Propostas**, foi adicionado o campo **«Modelo padrão ao criar no Chat»**.
- Valores possíveis: **Nenhum** ou um **rascunho** listado via `GET /api/proposals?status=draft` (mesmo tenant, permissões do módulo).
- Persistência: `metadata.kanban_proposals.default_proposal_template_id` (UUID), sem tabela nova.
- Backend (`sanitizeKanbanProposalsInMetadata` + `createColumn` / `patchColumn`): o bloco `kanban_proposals` **mantém-se** se existir apenas o modelo (correção face a versões que apagavam o bloco quando só havia modelo).
- Validação ao gravar: o UUID tem de corresponder a uma proposta **`status = draft`** cujo criador (`proposals.user_id`) pertence ao **mesmo tenant** (`users.tenant_id`). Caso contrário, **400** com mensagem clara.

## Carregamento dos «modelos»

- Não existe tabela paralela de templates: o «modelo» é **outra linha** em `proposals` em estado rascunho.
- A UI da coluna chama `proposalsService.getProposals({ status: 'draft' })` (até 200 entradas para o selector).
- Se o UUID guardado já não aparece na lista (rascunho apagado, enviado, etc.), mostra-se **aviso** na folha de definições; o utilizador pode corrigir ou escolher «Nenhum».

## Aplicação ao criar proposta (Chat / Kanban)

1. **No Kanban**, no drawer do cartão, o botão **«Criar proposta no Chat»** grava em `sessionStorage` o contexto `{ conversationId, boardId, columnId, autoOpenProposal: true }` e navega para `/chat` com `state.openConversationId`.
2. No **Chat**, após a conversa estar selecionada e hidratada, um efeito lê o contexto, obtém as colunas do quadro, lê `default_proposal_template_id` da coluna e valida o rascunho com `getProposalById`. Se inválido: **toast** informativo e abre o fluxo **sem** modelo.
3. O menu existente **«Criar proposta»** continua a funcionar: se houver contexto Kanban **sem** `autoOpenProposal` (extensível no futuro), o `consume` resolve o modelo da mesma forma.
4. O formulário lateral recebe `initialTemplateProposalId`; o `ProposalCreateForm` chama **`proposalsService.getProposalById`** e copia título (com prioridade à sugestão do contacto), descrição, itens, valor único, funil/estágio, validade e `post_accept_billing_mode`, alinhado ao que a API já devolve — **sem segunda lógica de merge** no Kanban.

## Cliente e lead

- O vínculo da conversa (`client_id` **ou** `lead_id`, mutuamente exclusivo na criação) mantém-se como na Etapa 1.
- O modelo da coluna **não** altera a regra de faturação: proposta para lead continua sem exigir cliente; faturamento automático após aceite continua sujeito às regras já existentes.

## Modelo inválido / inacessível

| Situação | Comportamento |
|----------|-----------------|
| UUID inválido na metadata | Removido no sanitize; ou rejeitado ao gravar coluna |
| Proposta deixou de ser `draft` | Resolução devolve `null`; toast; formulário abre vazio de modelo |
| Erro de rede / 403 em `getProposalById` | Toast; fluxo sem modelo |
| Guardar coluna com modelo inválido | **400** no backend |

## Riscos remanescentes

- Listas muito grandes de rascunhos: o selector limita a 200 itens na UI (o tenant pode ter mais).
- `sessionStorage` pode ser limpo antes de chegar ao Chat: o fluxo volta ao comportamento normal (sem modelo).
- Duas abas com o mesmo contexto: o primeiro consumo remove a chave; a segunda não aplica modelo (aceitável).

## Checklist de aceite

- [ ] Coluna pode selecionar modelo padrão de proposta (rascunho)
- [ ] Modelos reais do módulo são listados (`status=draft`)
- [ ] Criar proposta a partir do cartão (botão no drawer) aplica o modelo da coluna quando válido
- [ ] Criação lateral continua a reaproveitar o `ProposalCreateForm` existente
- [ ] Funciona para cliente (`client_id`) e lead (`lead_id`)
- [ ] Modelo inválido não quebra a criação (fallback sem modelo + mensagem)
- [ ] Etapas 1 e 2 (totais no cartão, mover ao aceitar) preservadas na metadata e no backend

---

**Esclarecimento:** o modelo **não** dispara criação de proposta só por mover o cartão. Ver [KANBAN_PROPOSTAS_AUTOMACAO_CRIACAO_POR_COLUNA.md](./KANBAN_PROPOSTAS_AUTOMACAO_CRIACAO_POR_COLUNA.md).
