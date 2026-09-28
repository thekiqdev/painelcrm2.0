# Mobile UX — Plataforma

Documentação da frente **experiência mobile** do painel (shell, navegação, fluxos prioritários).

## Conteúdo

| Documento | Descrição |
|-----------|-----------|
| [STATUS.md](./STATUS.md) | Fase atual, andamento e próximas rodadas |
| [PHASE-01-mobile-foundation.md](./PHASE-01-mobile-foundation.md) | 1ª rodada: fundação (nav, home, chat em duas telas) |
| [PHASE-02-business-lists-and-details.md](./PHASE-02-business-lists-and-details.md) | 2ª rodada: listas comerciais e detalhes (clientes, cobranças, propostas, contratos) |
| [PHASE-03-details-settings-and-state.md](./PHASE-03-details-settings-and-state.md) | 3ª rodada: URL dos filtros, detalhes mobile, configurações, microajustes |
| [PHASE-04-polish-chat-dashboard-and-shell.md](./PHASE-04-polish-chat-dashboard-and-shell.md) | 4ª rodada: polimento chat, dashboard operacional mobile, shell e teclado |
| [PHASE-05-final-consistency-and-polish.md](./PHASE-05-final-consistency-and-polish.md) | 5ª rodada: consistência final, estados, ergonomia e safe areas |

## Princípios

- Lista primeiro; detalhe em tela separada quando fizer sentido no mobile.
- Bottom navigation curta; itens secundários no **Mais** (agrupado).
- Não substituir a navegação desktop; o mobile tem shell próprio (`md:hidden` onde aplicável).
- Chat como fluxo prioritário no mobile: lista → conversa em rota dedicada.
