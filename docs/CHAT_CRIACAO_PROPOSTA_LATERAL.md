# Chat — criação de proposta no painel embutido (mesmo padrão da fatura)

## Resumo

A ação **Criar proposta** foi adicionada ao menu de ações rápidas do cabeçalho da conversa (ícone **⋮** / `MoreVertical`), ao lado das demais ações (fatura, contrato, tarefa, etc.). O fluxo **não** usa Sheet lateral do Kanban nem modal central: reutiliza o mesmo mecanismo já usado pela **Criar fatura** — estado `viewMode` em `Chat.tsx` que troca o conteúdo da coluna central do cartão da conversa por um formulário embutido, com botão **Voltar para conversa**.

## Como a ação foi adicionada

- Arquivo: `src/pages/Chat.tsx`
- Condição de exibição: conversa com `client_id` **ou** `leadId`, e permissão `canCreate('proposals')` via `useModulePermissions()` (enquanto permissões carregam, a ação não aparece).
- O item antigo **Enviar proposta**, que abria um dialog com mini-formulário (e ainda enviava `lead.id` como `client_id` em alguns casos), foi **substituído** por **Criar proposta** com o fluxo correto e formulário completo.

## Recurso lateral / embutido reaproveitado (fatura)

- **Mesmo padrão da fatura**: `viewMode === 'invoice-create'` vs novo `viewMode === 'proposal-create'`, renderizando `CardContent` com scroll, botão **Voltar para conversa** e componente embutido — espelhando `CustomerInvoiceNew` com `embedded`.
- Não foi introduzido um segundo drawer/Sheet específico para proposta no chat principal.

## Formulário de proposta (sem duplicação)

- Extraído para: `src/components/proposals/ProposalCreateForm.tsx`
- Props relevantes:
  - `embedded`: layout compacto no chat (sem cabeçalho de página “Nova proposta”).
  - `initialClientId`: **apenas** `selectedConversation.client_id` quando a conversa é de cliente — **nunca** id de lead.
  - `initialTitle`: sugestão `Proposta — {nome do contato}` quando há cliente ou lead carregado.
  - `onBack` / `onCreated`: integração com o chat (fechar painel, timeline, notificação).
- A página `src/pages/NewProposal.tsx` passou a ser um reexport desse componente (rota `/proposals/new` inalterada em espírito).

## Cliente vs lead

- **Cliente**: `initialClientId` pré-preenche o combobox de cliente; `client_id` enviado ao backend permanece o do CRM.
- **Lead**: não há `client_id` na conversa; o formulário abre com cliente **não** selecionado (equivalente à filosofia do contrato no chat: rascunho/entidade sem FK inválida). Texto de ajuda curto no modo embutido explica que é possível associar um cliente depois pelo combobox.
- O metadata de `messagesService.send` no chat deixou de enviar `client_id` quando o contato é apenas lead (`currentClient` ausente), evitando confundir `leads.id` com `clients.id`.

## Pós-criação (alinhado à fatura + notificação herdada)

- Ao concluir: `viewMode` volta para `'conversation'` (como na fatura).
- **Toast**: mensagem curta de sucesso (enviada vs rascunho).
- **Timeline do cliente** (só se houver `client_id` CRM na conversa ou na proposta criada): eventos `chat_proposal_created` (enviada) e `chat_proposal_draft_saved` (rascunho), registrados via `recordClientTimelineEvent`. Tipos novos incluídos no backend (`clientsController` + `clientTimelineEventsService`) e no frontend (`clients.ts`, labels em `ClientProfile.tsx`).
- **Notificação** (`sendNotification('proposals', 'created', ...)`) mantida quando há contato com telefone/e-mail, como no fluxo antigo do dialog (variáveis título, valor, link — preferindo link público quando a API devolver `public_link_path`).

## Riscos remanescentes

- Permissões: a UI oculta a ação sem permissão; o backend continua sendo a fonte de verdade para `POST /api/proposals`.
- Troca de conversa com o painel de proposta aberto: o formulário remonta pela `key={selectedConversation.id}`; o operador pode querer voltar manualmente à conversa.
- Templates de mensagem `proposals/created` podem depender de variáveis ou metadata específicos — qualquer ajuste fino é de configuração de notificações no produto.

## Checklist de aceite

- [x] Ação **Criar proposta** nas ações rápidas do cabeçalho da conversa (menu ⋮).
- [x] Abertura no **mesmo padrão embutido** da fatura (`viewMode` + `CardContent` + Voltar).
- [x] Formulário **único** (`ProposalCreateForm`) na página nova e no chat.
- [x] Fluxo com **cliente** (`initialClientId`).
- [x] Fluxo com **lead** (sem `client_id` forçado; sem misturar ids).
- [x] Pré-preenchimento de título sugerido e cliente quando aplicável.
- [x] Permissão `proposals` create na UI.
- [x] UX consistente com fatura (painel embutido, voltar, toast, timeline quando cliente CRM).
