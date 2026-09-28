# Etapa D.3 — Shell React `/chat/kanbam`

**Entrega:** rota, menu, página base, consumo de boards/colunas/cards (só contagem), estados vazio/loading/erro. **Sem** DnD, **sem** drawer, **sem** alterações a `Chat.tsx` ou CRM.

## Rota

- **`/chat/kanbam`** — `App.tsx`, lazy `ChatKanbanPage`, mesmo `AuthGuard` + `AppLayout` que `/chat`.
- **`RequireModuleView`:** `pathname.startsWith('/chat')` continua a mapear módulo `chat` (inclui `/chat/kanbam`).
- **Chat ativo só em `/chat`:** `NavLink` de Chat com prop **`end`** para não marcar ativo em `/chat/kanbam`.

## Menu

- **Atendimento:** item **Kanban** (`LayoutGrid`) logo abaixo de **Chat**, mesma condição `hasChat && canView('chat')`.
- **Preload:** `routePreload.chatKanban()`.

## Ficheiros

| Ficheiro | Função |
|----------|--------|
| `src/pages/ChatKanbanPage.tsx` | Página: fetch boards, seleção automática (único ou primeiro), fetch colunas + cards, contagem por coluna, dialog criar board |
| `src/services/chatKanban.ts` | `listBoards`, `getBoard`, `createBoard`, `listColumns`, `listCards` → `/api/chat/kanban` |
| `src/components/chat-kanban/ChatKanbanToolbar.tsx` | Título, subtítulo, select de board, botão novo quadro |
| `src/components/chat-kanban/ChatKanbanColumnShell.tsx` | Cartão de coluna: nome, badge contagem, área placeholder |
| `src/components/chat-kanban/ChatKanbanEmptyState.tsx` | Estados vazio reutilizável |
| `src/App.tsx` | Rota `/chat/kanbam` (antes de `/chat` por legibilidade) |
| `src/layouts/AppLayout.tsx` | Menu + `end` no link Chat |
| `src/routePreload.ts` | `chatKanban` |

## Próxima etapa (sugestão)

- UI para criar/editar colunas (ou atalhos).
- Cartões com preview (nome, telefone, última mensagem).
- Drawer/modal da conversa reutilizando `chatService`.
- Drag and drop (`@dnd-kit` ou padrão do projeto).

## Checklist manual

1. Utilizador com feature `chat` e tenant.
2. Migrar D.2 se ainda não aplicado.
3. Abrir `/chat/kanbam` — shell e loading.
4. Sem boards — empty state + criar quadro no dialog.
5. Com colunas na API — colunas horizontais com contagem (se houver cards).
6. `/chat` abre só lista clássica; item Chat não fica ativo em Kanban.
