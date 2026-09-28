# Chat — criação de contrato no painel embutido (mesmo padrão de fatura/proposta)

## Resumo

A ação **Criar contrato** no menu de ações rápidas (cabeçalho da conversa, ícone **⋮**) passou a abrir o **mesmo fluxo completo** da página de contratos (`ContractCreateForm`), embutido na coluna central do cartão da conversa — **sem** o dialog central antigo (mini-fluxo duplicado removido).

## Como a ação foi adicionada

- Arquivo: `src/pages/Chat.tsx`
- `viewMode` inclui `'contract-create'`, no mesmo estilo de `'invoice-create'` e `'proposal-create'`: `CardContent` com scroll, botão **Voltar para conversa**, formulário embutido.
- Exibição da opção: `canCreate('contracts')` via `useModulePermissions()` (`canCreateContractsInChat`), para conversa com **cliente** ou **lead** (com `currentClient` / `currentLead` carregados e `handleCreateContract` exige vínculo).

## Recurso lateral reaproveitado

- **Idêntico à fatura e à proposta**: troca de conteúdo da coluna do chat por `viewMode` + `CardContent` + **Voltar para conversa** — não é Sheet do Kanban nem nova rota dentro do chat.

## Formulário (sem duplicação de lógica)

- O conteúdo que estava em `src/pages/NewContract.tsx` foi movido para **`src/components/contracts/ContractCreateForm.tsx`** (export nomeado + default).
- `src/pages/NewContract.tsx` tornou-se um invólucro que passa `contractId` vindo de `useParams()` (rotas `/contracts/new` e `/contracts/:id/edit` inalteradas em URLs).
- Props relevantes para o chat:
  - `embedded`
  - `initialClientId`: só `selectedConversation.client_id` (nunca id de lead)
  - `initialSigners`: primeiro signatário pré-preenchido com nome/e-mail do contato; CPF/CNPJ do cliente CRM ou do lead quando existir campo compatível
  - `initialTitleHint`: `Contrato — {nome}`
  - `onBack` / `onCreated(contract, mode)` com `mode`: `'draft'` | `'signature'`
- Modo embutido: inicia direto no passo de edição (sem assistente “em branco / modelo” da primeira tela — o utilizador continua a poder usar modelos e todo o editor na mesma UI).

## Cliente vs lead

- **Cliente**: `initialClientId` preenche o CRM; `client_id` enviado ao backend só quando é cliente real.
- **Lead**: sem `initialClientId`; o utilizador associa cliente no combobox se quiser; **não** se envia `lead.id` como `client_id` (regra já documentada no código do serviço de contratos).
- Signatário inicial vem do contato (cliente ou lead); CPF pode ficar vazio no lead — o formulário completo exige validação na gravação/envio (igual à página normal).

## Pós-criação (alinhado a proposta/fatura)

- Ao concluir: `viewMode` volta a `'conversation'`.
- **Timeline** (se existir `client_id` CRM na conversa ou no contrato): `chat_contract_draft_saved` (rascunho) ou `chat_contract_sent_for_signature` (envio para assinatura). Tipos novos em backend (`clientsController`, `clientTimelineEventsService`) e frontend (`clients.ts`, labels em `ClientProfile.tsx`).
- **Notificação** `contracts/created` quando há contato com canal (como antes no dialog), com link e URL pública quando a API devolver `public_view`.
- **Toasts** distintos para rascunho vs envio para assinatura (o formulário não duplica toast de sucesso de envio quando `onCreated` está ativo — o pai trata o feedback principal).

## Permissões

- UI: `canCreate('contracts')` para mostrar **Criar contrato**; no formulário embutido, verificação `canCreate` / `canEdit` conforme novo vs edição (no chat só criação).
- Backend continua a ser a fonte de verdade.

## Riscos remanescentes

- Formulário completo na coluna do chat pode ser **denso** em ecrãs pequenos — mesmo trade-off que proposta/fatura embutidas.
- `getContractById` após criar pode não incluir todos os campos opcionais de vista pública; a notificação usa asserção local segura para `public_view` no `Chat.tsx`.

## Checklist de aceite

- [x] Ação **Criar contrato** nas ações rápidas (cliente e lead).
- [x] Abertura embutida igual à fatura/proposta (`viewMode` + `CardContent`).
- [x] Formulário **único** (`ContractCreateForm` + rotas existentes).
- [x] Cliente com `initialClientId`; lead sem misturar ids no CRM.
- [x] Pré-preenchimento de título e signatário inicial.
- [x] Permissão `contracts` na UI.
- [x] UX de pós-criação alinhada (toast, timeline, notificação).
