# Propostas — ajustes finais (lista, editor, vista pública)

Pacote incremental de UX: navegação na lista, atalho à página pública, filtros, editor rico compartilhado e ordem/conteúdo na visualização pública. **Sem alterar** token opaco, aceite/recusa, faturamento `proposal_id`, webhooks nem permissões finas.

## 1. Clique na linha abre a proposta

- **Arquivo:** `src/pages/Proposals.tsx`
- A linha da tabela usa `cursor-pointer`, `hover`/`active` com transição, `role="link"`, `tabIndex={0}` e `Enter`/`Espaço` para abrir o detalhe.
- A coluna de **ações** (`DropdownMenu`) mantém `stopPropagation` para não disparar navegação ao usar o menu.

## 2. Botão para abrir a proposta pública

- **Detalhe (`ProposalDetails`):** botões **Abrir proposta pública** (nova aba) e **Copiar link**, no topo ao lado de Lista.
  - Habilitados quando existe link **ativo** **e** URL conhecida nesta **sessão** (ver abaixo).
- **Lista:** item de menu **Abrir proposta pública** — abre se a URL tiver sido guardada no `sessionStorage` após gerar/copiar o link; caso contrário, mensagem orientando ir ao detalhe → Faturamento.
- **Persistência de URL na sessão:** `src/utils/proposalPublicLinkSession.ts` — ao **gerar** link, grava-se a URL completa; ao **revogar**, remove-se; ao carregar o detalhe com link ativo, restaura-se do `sessionStorage`.
  - **Motivo:** o token cru não é armazenado em claro no servidor após a emissão; sem nova emissão não é possível reconstruir a URL. O padrão escolhido evita fluxo paralelo e mantém segurança.

## 3. Filtros superiores

- **Arquivo:** `src/pages/Proposals.tsx` — painel compacto acima da tabela:
  - Busca textual (debounce) — título e descrição.
  - Status (select, inclui “Todos”).
  - Cliente — `ClientSearchCombobox` com `remoteSearch`.
  - Responsável — “Todos”, “Minhas propostas” (`owner_user_id` = usuário atual) ou usuário do tenant (`GET /api/me/tenant/users`).
  - Validade — “Dentro do prazo / sem data” vs “Vencidas (por data)”.
  - Faturamento — “Com fatura” / “Sem fatura” (`converted_invoice_id`).
  - **Limpar filtros** quando houver algo ativo.
- **Backend:** `packages/backend/src/controllers/proposalsController.ts` — query params `q`, `owner_user_id`, `validity` (`valid` | `expired`), `conversion` (`yes` | `no`).
- **Frontend service:** `src/services/proposals.ts` — tipo `ProposalListFilters`.

## 4. Editor padrão para descrição comercial

- Reutilizado **`RichTextEditor`** (`src/components/shared/RichTextEditor.tsx`) — mesmo componente de contratos/templates (DOMPurify nos tags/atributos permitidos).
- **Criação:** `src/pages/NewProposal.tsx` — substituído `Textarea` por `RichTextEditor`.
- **Edição:** `src/pages/ProposalDetails.tsx` — aba Resumo, com **Salvar descrição** (`PATCH` com `description`).
- **Sanitização / leitura:** `src/utils/proposalRichText.ts` — `sanitizeProposalHtml`, `isProposalDescriptionHtml` (texto legado sem tags continua exibível).

## 5. Página pública: descrição antes dos itens

- **Arquivo:** `src/pages/PublicProposalView.tsx`
- Ordem no corpo: **Descrição / conteúdo comercial** → **Itens e valores** (com total na tabela) → **Alert** com termo/disclaimer (observações legais) → mensagens de estado (faturada, aceita, etc.).
- HTML sanitizado com o mesmo perfil do editor; texto plano legado com `whitespace-pre-wrap`.

## 6. Edição da descrição no detalhe

- **Arquivo:** `src/pages/ProposalDetails.tsx`
- Quem pode editar: `canEditThis && !isInvoiced` (alinha ao bloqueio geral de proposta já faturada no backend).
- Conteúdo carregado em estado local e persistido com `updateProposal`.

## Riscos remanescentes

- **URL pública após refresh:** sem entrada no `sessionStorage`, “Abrir”/“Copiar” no topo exige gerar de novo ou usar o campo na aba Faturamento (comportamento documentado no `title` dos botões).
- **Busca `q`:** também corresponde a HTML na descrição (pouco legível, mas funcional).
- **Propostas muito antigas:** descrição só texto continua válida; formatação rica só após reedição no novo editor.

## Checklist

- [x] Clicar na linha abre a proposta
- [x] Existe botão para abrir a proposta pública (detalhe + atalho na lista quando há URL em sessão)
- [x] Filtros superiores reorganizados e úteis
- [x] Descrição comercial usa o editor padrão do sistema (`RichTextEditor`)
- [x] Página pública mostra descrição antes dos itens
- [x] Edição da proposta permite alterar a descrição comercial
- [x] Consistência create / edit / view pública com o mesmo campo e sanitização
