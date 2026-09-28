# PHASE-04 — Polimento: Chat, Dashboard e shell mobile

**Última atualização:** 2026-04-25

## 1. Objetivo da Etapa 4

Consolidar o acabamento da experiência mobile da plataforma: refinar Chat (lista + conversa + composer), tornar a **Home / Dashboard** mais operacional no telefone, aprimorar o **shell** (bottom nav, “Mais”, cabeçalhos, microinterações leves) e documentar decisões sobre atalhos globais — **sem** reabrir o escopo das Fases 1–3 nem redesign completo do desktop.

## 2. Escopo exato da etapa

- Refinos de UI/UX e comportamento **somente onde já existe base mobile** (Etapas 1–3).
- Chat: hierarquia da lista, leitura do histórico, composer e teclado virtual.
- Dashboard: hierarquia mobile, cards e blocos de status; conteúdo analítico pesado permanece desktop-only.
- Shell: bottom navigation, sheet “Mais”, safe areas, feedback tátil discreto.
- Decisão explícita sobre FAB / atalhos adicionais.

## 3. O que entra

- Lista de conversas: toque, preview, hora, badges, estados vazio/loading.
- Conversa: header, bolhas, espaçamento; ações secundárias menos visíveis no mobile.
- Composer: auto-grow mantido; `VisualViewport` para reduzir conflito com teclado.
- Dashboard mobile: atalhos primeiro; indicadores compactos; resumo operacional; trial/ativação coerentes.
- Nav inferior e sheet “Mais”: hierarquia, safe area, toques.
- Cabeçalho global: `safe-area-inset-top` no mobile.
- Documentação e checklist desta fase.

## 4. O que não entra

- Launcher de ícones PWA; redesign total do desktop; grandes mudanças em módulos fora do fluxo mobile já tratado.
- Animações chamativas ou festival de microinterações.
- Nova arquitetura de rotas principais (Início / Clientes / Cobranças / Chat / Mais permanece).

## 5. Pendências herdadas das Etapas 1, 2 e 3

- Perfil de lead a partir do chat ainda informativo (“em desenvolvimento”) — fora do escopo fechado da Fase 4.
- Telemetria dedicada mobile — apenas mencionada no roadmap geral, não implementada aqui.
- Contagem de não lidas no dashboard exigiria endpoint novo — não adicionado; atalho “Chat” permanece sem badge agregado.

## 6. Direção final do Chat mobile

- **Tela A** lista: cartão por conversa com hierarquia nome → preview (2 linhas) → meta; hora e não lidas destacados; linha de toque ≥ ~72px.
- **Tela B** conversa: header compacto; histórico com respiro; no mobile, **Sincronizar** e **Transferir** entram no menu “⋯” para reduzir ruído; atendimento (Atender / Encerrar) permanece visível.
- Composer: `sticky` acima da bottom nav com `calc(7rem + inset)` quando o teclado virtual reduz o viewport.

## 7. Direção da Home / Dashboard mobile

- Ordem: **Atalhos rápidos** → **Indicadores do período** (se módulo dashboard) → **Resumo do dia** (operação) → blocos de **Clientes / cobranças** compactos → trial/ativação → restante invisível no mobile (`md:` apenas).

## 8. Direção do shell mobile

- Bottom nav: toque confortável, estado ativo mais claro, ícone ativo com leve ênfase.
- “Mais”: handle visual, grupos com separação, links com `active:`; sheet com padding inferior respeitando safe area.
- Transições: apenas as já fornecidas pelo Radix Sheet + classes utilitárias mínimas.

## 9. Decisão sobre atalhos rápidos / FAB

**Não implementar FAB global nesta etapa.**

Motivos: a bottom nav já cobre os destinos principais; a home mobile já expõe **Atalhos rápidos** em grid (nova cobrança, clientes, propostas, etc.); um FAB competiria com a nav e duplicaria “Nova cobrança” / “Clientes” sem ganho claro. A decisão pode ser revista na Fase 5 se houver dados de uso.

## 10. Checklist de implementação

- [x] Hook `useVisualKeyboardInset` e uso no composer (mobile + rota conversa).
- [x] Lista de conversas e estados loading/vazio refinados.
- [x] Bolhas / padding do histórico.
- [x] Header conversa: sync/transfer no menu no mobile.
- [x] Dashboard: seções mobile reordenadas e indicadores compactos.
- [x] `MobileAppNavigation` + sheet “Mais”.
- [x] `AppLayout` header safe-area-top.
- [x] Documentação PHASE-04 + STATUS + README.

## 11. Checklist de validação

- [x] `npm run build` sem erros.
- [x] Desktop: grids/gráficos do dashboard inalterados (`md:` / `hidden`).
- [x] Tema claro/escuro: apenas tokens existentes.
- [x] Navegação principal intacta.

## 12. Status da fase

| Estado | Descrição |
|--------|-------------|
| ~~Pendente~~ | — |
| ~~Em andamento~~ | — |
| **Concluído** | Entrega Fase 4 aplicada em código e docs. |

### Pós-implementação

**Arquivos alterados / criados**

- `docs/mobile-ux/PHASE-04-polish-chat-dashboard-and-shell.md` (este arquivo)
- `docs/mobile-ux/STATUS.md`
- `docs/mobile-ux/README.md`
- `src/hooks/useVisualKeyboardInset.ts`
- `src/pages/Chat.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/navigation/MobileAppNavigation.tsx`
- `src/layouts/AppLayout.tsx`

**Rotas / módulos impactados**

- `/chat`, `/chat/:conversationId` (comportamento visual mobile)
- `/dashboard` (layout mobile)
- Shell global (todas as rotas autenticadas com `AppLayout`)

**Validações realizadas**

- Build de produção.
- Revisão estática: classes condicionais `md:` preservam desktop.

**Pendências sugeridas para PHASE-05**

- Badge agregado de não lidas na home (se API existir ou for criada).
- Perfil de lead a partir do chat.
- Testes manuais em dispositivos físicos iOS/Android para fine-tuning de `VisualViewport`.
