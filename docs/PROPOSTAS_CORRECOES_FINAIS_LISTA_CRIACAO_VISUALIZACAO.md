# Propostas / Orçamentos — correções finais (lista, criação, visualização pública)

Pacote incremental de UX e fluxo operacional, **sem reabrir** a arquitetura das Etapas 1–5 (faturamento com `proposal_id`, link público com token opaco, aceite/recusa, `post_accept_billing_mode`, `proposal_integration_events`, outbound/webhooks, permissões finas).

## Listagem em tabela

- **Arquivo:** `src/pages/Proposals.tsx`
- A listagem principal deixou de usar **cards** e passou a usar **`<Table>`** (shadcn) com colunas:
  - **Código:** `PROP-` + 8 primeiros caracteres hex do UUID (referência interna compacta; não substitui identificador real `id`).
  - Título, cliente, responsável (`responsible_email` da API), status, validade, valor, atualizado em (`updated_at`), ações.
- **API:** mantida (`GET /api/proposals` com filtros por abas). Foi adicionado no backend o campo opcional **`client_name`** (JOIN com `clients` + escopo de tenant) para evitar carregar todos os clientes só para exibir nomes na lista.
- **Arquivo backend:** `packages/backend/src/controllers/proposalsController.ts` (`getProposals`, `getProposalById`).

## Página única de criação

- **Rota:** `/proposals/new`
- **Arquivos:** `src/pages/NewProposal.tsx`, registro em `src/App.tsx`
- **Blocos:**
  - **A — Dados principais:** título, cliente (`ClientSearchCombobox` com `remoteSearch`), responsável (somente leitura — criador da proposta / e-mail comercial na API), validade, descrição, política pós-aceite (`post_accept_billing_mode`), funil/estágio opcional.
  - **B — Itens:** componente reutilizável (ver abaixo).
  - **C — Totais:** subtotal bruto, soma de descontos por linha, total; ou valor único se não houver linhas.
  - **D — Ações:** “Salvar rascunho e voltar à lista” e “Salvar rascunho e abrir” (detalhe).
- **Serviço:** `createProposal` em `src/services/proposals.ts` passou a enviar `post_accept_billing_mode` no POST (compatível com o schema Zod já existente no backend).

## Itens: personalizados + produtos/serviços do catálogo

- **Arquivo:** `src/components/proposals/ProposalItemsEditor.tsx`
- **Catálogo:** produtos e serviços vivem na mesma entidade `products` com `type: 'product' | 'service'` (`GET /api/products` via `productsService.getProducts()`).
- **Comportamento:**
  - Linha **manual**.
  - Inserção a partir de **produto** ou **serviço**: copia nome/descrição curta e preço efetivo (`resolvePublicCatalogUnitPrice`); **não** grava `product_id` na linha — o item é só JSON da proposta.
  - Quantidade, unitário e desconto por linha editáveis; total por linha recalculado no cliente (alinhado à normalização do backend).

## Edição no detalhe (rascunho / enviada)

- **Arquivo:** `src/pages/ProposalDetails.tsx`
- Para status **`draft`** ou **`sent`**, sem fatura: edição de **cliente** com o mesmo `ClientSearchCombobox` (remoto) e edição de **itens** com `ProposalItemsEditor` + botão “Salvar itens e total” (`PATCH` com `items`; o backend recalcula `amount` quando há linhas).

## Visualização pública (página única reforçada)

- **Arquivo:** `src/pages/PublicProposalView.tsx`
- **Rota:** `/proposal-view/:token` (inalterada).
- Layout em **documento único** mais comercial: cabeçalho com tenant, título, cliente, status, total, faixa de metadados (validade, contato, envio), corpo com descrição e tabela de itens (coluna de desconto quando aplicável), mensagens de estado (aceita, recusada, expirada, **faturada**), **rodapé fixo** só quando aceite/recusa são permitidos.

## Busca de cliente padrão

- Reutilizado **`ClientSearchCombobox`** (`src/components/clients/ClientSearchCombobox.tsx`) com **`remoteSearch`**, o mesmo padrão usado em outros fluxos (ex.: contratos). Persistência via `client_id` na proposta.

## Remoção de “Mensagens prontas (envio manual)”

- **Arquivo:** `src/pages/ProposalDetails.tsx`
- Removida a seção de UI e o carregamento associado (`postProposalOperationalPreview` / snippets).
- **Backend** do endpoint operacional **permanece** disponível para uso interno ou futuro; apenas não é mais exposto ao usuário final neste módulo.

## Riscos remanescentes

- **Código `PROP-xxxxxxxx`:** é um rótulo derivado do UUID para leitura humana; não é um número sequencial comercial.
- **Lista de produtos:** `getProducts()` carrega o catálogo inteiro na página de criação/edição; tenants com catálogo muito grande podem precisar de busca paginada no futuro (fora do escopo deste pacote).
- **Deploy:** o campo `client_name` na API exige **deploy coordenado** backend + frontend; clientes antigos do frontend ignoram o campo extra sem quebrar.

## Checklist de aceite

- [x] Propostas aparecem em lista/tabela
- [x] Criação da proposta ocorre em página única (`/proposals/new`)
- [x] Itens podem ser personalizados ou vir de produtos/serviços existentes (catálogo `products`)
- [x] Visualização pública da proposta está em página única com aceite/recusa e estados claros
- [x] Busca de cliente usa o padrão do sistema (`ClientSearchCombobox` + `/api/clients?q=`)
- [x] Mensagens prontas (envio manual) foram removidas da UI
- [x] Módulo mais coeso: listagem densa, criação centralizada, público com rodapé de ação
