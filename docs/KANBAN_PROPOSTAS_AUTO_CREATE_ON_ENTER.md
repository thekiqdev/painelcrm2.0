# Kanban Chat — criação automática de proposta ao entrar na coluna

## Comportamento anterior vs. novo

| Aspecto | Antes (assistido) | Agora |
|--------|-------------------|--------|
| Mover cartão | Não criava proposta | Com `auto_create_proposal_on_enter` + modelo válido, o **backend cria** a proposta na entrada na coluna |
| Modelo da coluna | Servia ao fluxo manual no Chat | Só existe **com** automação ligada; é a base da proposta criada automaticamente |
| Drawer do Kanban | Atalho «Criar proposta no Chat» | Apenas texto informativo quando a coluna tem automação (sem atalho manual) |
| Chat (menu) | Pré-preenchimento a partir da coluna | **Criar proposta** no Chat é sempre manual completo; não há ligação ao modelo da coluna |

Colunas antigas com modelo guardado **sem** `auto_create_proposal_on_enter`: ao abrir a configuração da coluna, a UI ativa a automação e mostra o modelo (migração de edição). O `sanitize` no backend **não** persiste `default_proposal_*` se a automação estiver desligada.

## Configuração (`chat_kanban_columns.metadata.kanban_proposals`)

- **`auto_create_proposal_on_enter`** (`boolean`): liga a criação automática ao entrar na coluna (mover cartão ou criar cartão já nessa coluna).
- **`default_proposal_model_id`** (UUID, preferido): modelo oficial em `proposal_templates`.
- **`default_proposal_template_id`** (UUID, legado): rascunho em `proposals`; só quando não há modelo oficial.

Regras no **backend**:

- **`default_proposal_model_id` / legado** só são gravados quando `auto_create_proposal_on_enter` é verdadeiro (`sanitizeKanbanProposalsInMetadata`).
- Se automação está **ligada**, deve existir **modelo ou legado** (`validateKanbanProposalAutoCreateOnEnter`).
- A criação automática **só corre** com automação ligada **e** referência válida (`runKanbanAutoCreateProposalInTransaction`).

## Aplicação do modelo

A lógica reutiliza o mesmo serviço de criação interna do backend (template oficial ou cópia do rascunho legado), incluindo título, itens, valores, funil/estágio quando aplicável, validade, `post_accept_billing_mode` (com ajuste para lead sem faturamento automático indevido). A proposta é persistida como **enviada** (`sent`) com data de envio, alinhado ao fluxo de «criar enviada» já usado no produto.

## Idempotência (fonte de verdade: backend)

**Regra adotada:** por cartão e **coluna de destino**, guarda-se em `chat_kanban_cards.metadata.kanban_auto_proposal_by_column[columnId]` o `proposal_id` da última criação automática.

- **Não** cria de novo se essa proposta ainda existe e está em **`draft`** ou **`sent`**.
- **Pode** criar de novo se a proposta foi aceita, faturada, recusada, expirada, apagada, ou deixou de existir — evita bloquear reentradas legítimas na coluna após encerramento comercial.

Isto evita duplicidade ao reordenar dentro da mesma coluna ou ao mover para fora e voltar, enquanto permite um novo ciclo após conclusão da proposta anterior.

## Cliente e lead (XOR)

- Conversa com **`client_id`**: proposta com cliente; faturamento segue as regras atuais.
- Conversa com **`lead_id`** (e sem cliente): proposta com lead; faturamento continua exigindo cliente válido quando aplicável.
- Nunca misturar `client_id` e `lead_id` na mesma proposta.

Se não houver cliente nem lead, a automação **não** cria proposta (sem contexto CRM).

## Impacto no Chat

- **Drawer do Kanban:** apenas aviso quando a coluna tem automação (sem criar proposta a partir do drawer).
- **Página Chat:** «Criar proposta» abre o formulário **sem** modelo vindo da coluna; contexto Kanban antigo em `sessionStorage` é descartado ao usar essa ação.

## Auditoria / timeline

O backend regista evento de timeline na proposta (tipo relacionado com `kanban_column_auto_proposal_created`), incluindo conversa, coluna, modelo e origem da automação, quando o serviço de timeline está disponível.

## UX após mover / adicionar cartão

A API `PATCH /cards/:id` e `POST .../cards` pode devolver **`kanban_auto_created_proposal`**: `{ id, title, public_link_path }`. O frontend do Kanban mostra toast de sucesso (e link público quando existir).

## Riscos remanescentes

- Utilizadores sem permissão `proposals/create`: automação não cria (falha silenciosa no passo de proposta; movimento do cartão mantém-se).
- Modelo inativo/removido após configurar coluna: validação ao gravar coluna reduz o risco; cartões antigos podem precisar reconfiguração.
- Reenvio de link público: segue o mesmo fluxo de emissão de token que em `createProposal` após commit.

## Checklist de aceite

- [x] Coluna pode configurar automação real de criação de proposta (`auto_create_proposal_on_enter` + modelo).
- [x] Mover cartão para a coluna cria proposta automaticamente (backend).
- [x] Proposta usa o modelo configurado.
- [x] Idempotência: não duplicar enquanto proposta automática anterior está `draft`/`sent` para aquele cartão+coluna.
- [x] Funciona para cliente e para lead (XOR).
- [x] Opção manual oculta no drawer quando a coluna está em modo automático.
- [x] Documentação atualizada (este ficheiro).
