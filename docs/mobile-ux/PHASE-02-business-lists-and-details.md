# PHASE-02 — Listas comerciais e detalhes no mobile

**Etapa:** 2  
**Data:** 2026-04-25  
**Estado:** concluída

## 1. Objetivo da Etapa 2

Aprofundar a **UX mobile real** nos módulos densos **Clientes/CRM**, **Cobranças**, **Propostas** e **Contratos**, aplicando o padrão transversal (lista → detalhe, filtros em sheet, cards no lugar de tabela quando fizer sentido), **sem** alterar a navegação principal da Etapa 1, **sem** redesenho profundo de chat/dashboard/configurações.

## 2. Escopo exato da etapa

- Listas mobile em **cards** ou linhas compactas.
- **Filtros** e buscas avançadas concentrados em **Sheet** no breakpoint mobile (`md` abaixo).
- Tabelas completas visíveis a partir de **`md`**.
- Detalhe já existente por rota (`/clients/:id`, `/customer-charges/:id`, `/proposals/:id`, `/contracts/:id`) — reforço de leitura vertical onde aplicável.
- Ajuste de **navegação secundária** do perfil de cliente no mobile (menu mais compacto).

## 3. O que entra

- Clientes: sheet “Busca e filtros”; lista em cards; tabela só desktop; filtros de aba/grupo/itens por página no sheet no mobile.
- Cobranças: sheet de filtros + busca (`q` API); lista em cards; hierarquia visual de status; detalhe com faturas em cards no mobile.
- Propostas: sheet com todos os filtros; lista em cards no mobile; tabela `md+`.
- Contratos: sheet com filtros de status/datas; busca; lista em cards no mobile; ações em menu; seleção em massa só desktop.

## 4. O que não entra

- FAB global, animações avançadas, launcher de ícones.
- Redesign completo do chat, dashboard ou configurações.
- Novas rotas de detalhe (reuso das rotas atuais).

## 5. Padrão mobile transversal aplicado

| Princípio | Aplicação |
|-----------|-----------|
| Lista primeiro | Cards `md:hidden` + tabela `hidden md:table` (ou equivalente) |
| Detalhe em página separada | Rotas existentes mantidas |
| Filtros em sheet | `Sheet` inferior no mobile nos quatro módulos |
| Ações secundárias | `DropdownMenu` nos cards; bulk só desktop em contratos |
| Leitura vertical | Cards empilhados; detalhe cobrança com lista de faturas em card |

## 6. Direção — Clientes / CRM

- Toque no card → `/clients/:id` (já existente).
- Busca + abas Todos/Ativos/Inativos + grupo + itens por página no **sheet** no mobile.
- Barra de busca visível no desktop; no mobile acionada pelo sheet.

## 7. Direção — Cobranças / Financeiro operacional

- Card com valor em destaque, status com cores, cliente, contagem de faturas, data de criação, CTA “Abrir”.
- Sheet: status, busca textual, paginação.
- Detalhe: resumo em card; faturas vinculadas como cards no mobile, tabela no desktop.

## 8. Direção — Propostas / Contratos

- Propostas: sheet com busca, status, cliente, responsável, validade, faturamento + limpar.
- Contratos: sheet com status, tipo de data, intervalo, aplicar/limpar; cards com número, título, cliente, status, datas, menu de ações.

## 9. Checklist de implementação

- [x] Documentação PHASE-02 + STATUS (+ README se necessário)
- [x] Clientes: sheet + cards mobile
- [x] ClientSidebar: chips horizontais no mobile
- [x] Cobranças lista + detalhe mobile
- [x] Propostas lista mobile + sheet filtros
- [x] Contratos lista mobile + sheet filtros

## 10. Checklist de validação

- [x] Listas usáveis no mobile (cards)
- [x] Detalhe continua em rota dedicada onde já existia
- [x] Filtros acessíveis via sheet no mobile
- [x] Desktop: tabelas e filtros inline preservados (`md+`)
- [x] Tema claro/escuro (classes existentes / tokens)
- [x] `npm run build` (Vite produção) executado com sucesso em 2026-04-25
- [x] Navegação Etapa 1 (bottom nav, chat, home) não alterada nesta fase

## 11. Status

| Área | Estado |
|------|--------|
| Documentação | concluído |
| Clientes / CRM | concluído |
| Cobranças | concluído |
| Propostas / Contratos | concluído |

## Arquivos criados/alterados

| Arquivo | Ação |
|---------|------|
| `docs/mobile-ux/PHASE-02-business-lists-and-details.md` | criado |
| `docs/mobile-ux/STATUS.md` | alterado |
| `docs/mobile-ux/README.md` | alterado |
| `src/pages/Clients.tsx` | alterado |
| `src/components/clients/ClientSidebar.tsx` | alterado |
| `src/pages/CustomerCharges.tsx` | alterado |
| `src/pages/CustomerChargeDetail.tsx` | alterado |
| `src/pages/Proposals.tsx` | alterado |
| `src/pages/Contracts.tsx` | alterado |

## Rotas impactadas (sem mudança de path)

- `/clients`, `/clients/:id`, `/clients/:id/:tab`
- `/customer-charges`, `/customer-charges/:id`
- `/proposals`, `/proposals/:proposalId`
- `/contracts`, `/contracts/:id`

## Pendências sugeridas — Etapa 3

> **Resolvido na PHASE-03** — ver [PHASE-03-details-settings-and-state.md](./PHASE-03-details-settings-and-state.md).

- ~~Sheet de filtros com persistência na URL (query params).~~
- ~~Detalhe de **Proposta** e **Contrato**: refino adicional de layout mobile~~
- ~~Clientes: placeholders do perfil~~ (links úteis para tarefas / financeiro / configurações)
