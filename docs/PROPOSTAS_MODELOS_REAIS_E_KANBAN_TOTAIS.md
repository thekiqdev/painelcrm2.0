# Modelos reais de proposta e totais no Kanban do chat

Documento de produto/implementação: área exclusiva de modelos, coluna do Kanban, agregação de valores e totais no cabeçalho da coluna.

## Área exclusiva de modelos

- **Tabela:** `proposal_templates` (migração `128_proposal_templates.sql`).
- **API:** `/api/proposal-templates` (CRUD com permissões do módulo `proposals`).
- **UI:** listagem em `/proposals/templates`, criação em `/proposals/templates/new`, edição em `/proposals/templates/:templateId/edit`.
- **Listagem no módulo:** botão **Modelos** no topo de **Propostas / Orçamentos** (`Proposals.tsx`), no mesmo padrão visual do botão em Contratos.

Os modelos guardam os mesmos blocos comerciais reutilizáveis da criação de proposta (título sugerido, descrição rica, itens ou valor único, funil/estágio, `post_accept_billing_mode`, ativo/inativo). **Não** são linhas em `proposals` e **não** devem ser confundidos com rascunhos operacionais.

## Navegação

| Destino | Rota |
|--------|------|
| Lista de propostas | `/proposals` |
| Modelos | `/proposals/templates` |
| Novo modelo | `/proposals/templates/new` |
| Editar modelo | `/proposals/templates/:id/edit` |

**Importante (React Router):** as rotas estáticas acima (`/proposals/templates`, `/new`, `/…/edit`) devem estar declaradas **antes** de `/proposals/:proposalId`. Caso contrário, `templates` é interpretado como UUID de proposta, a página de detalhe chama `GET /api/proposals/templates` e o backend tenta buscar proposta com id inválido.

## Coluna do Kanban: modelo real vs legado

- **Campo preferido na metadata da coluna:** `kanban_proposals.default_proposal_model_id` → UUID de `proposal_templates` (modelo ativo validado no backend).
- **Legado:** `default_proposal_template_id` apontava para rascunho em `proposals`. Mantido só para compatibilidade: se a coluna ainda só tiver o UUID legado e existir rascunho válido, o pré-preenchimento no chat pode continuar a funcionar até a coluna ser reconfigurada.
- **Sanitize ao gravar:** se existir `default_proposal_model_id`, o legado tende a não ser reescrito; novas configurações devem usar apenas modelos oficiais.

## Regra de valores no Kanban (card e coluna)

Política única para totais comerciais exibidos no cartão e somados no topo da coluna (backend `chatKanbanController`, agregação SQL):

| Status da proposta (`proposals.status`) | Contribui para “pendente” | Contribui para “aceito” |
|----------------------------------------|---------------------------|-------------------------|
| `sent` | Sim | Não |
| `accepted` | Não | Sim |
| `invoiced` | Não | Sim |
| Demais (`draft`, `rejected`, `expired`, …) | Não | Não |

**Motivo:** proposta faturada já foi aceita comercialmente; não deve zerar o valor “aceito” no Kanban.

- **Pendente:** soma de `amount` onde `status = 'sent'`.
- **Aceito:** soma de `amount` onde `status IN ('accepted', 'invoiced')`.

O vínculo continua **exclusivo** por conversa: `client_id` **ou** `lead_id` (nunca ambos na mesma proposta), alinhado à Etapa 1. A automação de mover cartão ao aceitar (Etapa 2) não é alterada por este documento.

## Totais no topo da coluna

- Componente: `ChatKanbanBoardColumn`.
- **Total pendente:** soma dos campos `proposal_pending_total` de todos os cartões da coluna, **apenas** se a coluna tiver `show_pending` em `kanban_proposals`.
- **Total aceito:** soma dos `proposal_accepted_total`, **apenas** se `show_accepted` estiver ativo.
- Os totais só aparecem quando há pelo menos um cartão na coluna e uma das flags está ligada — mesma lógica de exibição dos valores nos cards (`ChatKanbanCard`).

## Bug do “R$ 0” em aceita/faturada

A causa era a agregação que não incluía `invoiced` no bucket “aceito”. Com `accepted` e `invoiced` no mesmo `CASE`, o card e o resumo da coluna passam a refletir o valor comercial correto quando a coluna mostra propostas aceitas.

## Compatibilidade e riscos

- **Produção:** rotas novas apenas no front; API de modelos já versionada por migração. Colunas antigas com UUID de rascunho continuam com fallback até reconfiguração.
- **Exclusão de modelo:** não apaga propostas; colunas que referenciam o UUID precisam ser reconfiguradas manualmente.
- **Faturamento:** continua exigindo cliente válido onde a regra de negócio já exige; esta etapa não altera essa validação.

Ver também: [KANBAN_PROPOSTAS_AUTOMACAO_CRIACAO_POR_COLUNA.md](./KANBAN_PROPOSTAS_AUTOMACAO_CRIACAO_POR_COLUNA.md) (modelo por coluna é **assistido** ao criar no Chat; não ao mover o cartão).

## Checklist de aceite

- [ ] Propostas possuem área exclusiva de modelos (`proposal_templates` + páginas dedicadas).
- [ ] Botão **Modelos** aparece no topo do módulo de propostas.
- [ ] Coluna do Kanban usa modelo real (`default_proposal_model_id`), com legado documentado.
- [ ] Topo da coluna mostra soma dos cards (pendente / aceito conforme flags).
- [ ] Card com proposta aceita mostra valor correto.
- [ ] Card com proposta faturada mostra valor correto.
- [ ] Total da coluna usa a mesma regra do card.
- [ ] Funciona para cliente e lead (vínculo XOR preservado).
- [ ] Faturamento continua exigindo cliente válido.
