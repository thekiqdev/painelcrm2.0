# PHASE-01 — Fundação mobile

**Rodada:** 1  
**Data:** 2026-04-25  
**Estado:** concluída

## 1. Objetivo da 1ª rodada

Entregar a **base da experiência mobile** da plataforma: shell com bottom navigation, menu **Mais** organizado, home com cara de app (ações antes de analytics pesada), e chat em **duas telas** (lista vs conversa), sem quebrar desktop e sem FAB global nem redesign amplo de módulos.

## 2. Escopo exato da rodada

- Navegação mobile própria (não sidebar comprimida).
- Home mobile com atalhos/cards operacionais.
- Chat mobile: rota de lista + rota de conversa; composer confortável com auto-grow limitado.
- Documentação e status em `docs/mobile-ux/`.

## 3. O que entra

- Bottom nav fixa: Início, Clientes, Cobranças, Chat, Mais.
- **Mais** em sheet inferior com grupos e curadoria por feature + `canView`.
- Remoção de **Planos** da navegação mobile (bottom + Mais).
- Remoção do **FAB** de ações rápidas nesta rodada.
- Rotas `/chat` e `/chat/:conversationId` compartilhando o mesmo componente `Chat`.
- Dashboard: seção mobile de atalhos + resumo operacional; KPIs/gráficos mantidos com prioridade desktop (`md+`).

## 4. O que não entra

- FAB global, animações avançadas, launcher de ícones como nav principal.
- Redesign profundo de CRM, cobranças, propostas/contratos ou configurações completas.
- Filtros do chat exclusivamente em sheet (planejado para PHASE-02).

## 5. Navegação mobile principal aprovada

| Item    | Rota principal        | Notas                          |
|---------|------------------------|--------------------------------|
| Início  | `/dashboard`           | Respeita feature + permissão   |
| Clientes | `/clients`           |                                |
| Cobranças | `/customer-charges` | Módulo `billing` + `invoices`  |
| Chat    | `/chat`                | Ativo também em `/chat/:id`    |
| Mais    | Sheet                  | Navegação secundária           |

## 6. Estrutura do menu “Mais”

- **Comercial:** Leads, Funil, Propostas, Contratos, Faturas, Assinaturas (conforme flags e `canView`).
- **Operação:** Chat Kanban, Tarefas, Projetos, Tickets, Financeiro (módulo financeiro amplo, não é CTA da bottom).
- **Conta e sistema:** Configurações, Administração (super admin), Sair.

“Planos” / `meu-plano` **não** entra no mobile nesta fase (decisão de produto da rodada).

## 7. Direção da home mobile

- Atalhos para ações reais (nova cobrança, novo cliente, nova proposta, novo contrato, chat, notificações quando existir rota).
- Card **Resumo do dia** com links para filas operacionais (leads sem resposta, tickets, tarefas).
- Gráficos grandes e blocos analíticos profundos com `hidden md:block` ou equivalente para não competir com atalhos no telefone.

## 8. Direção do chat mobile

- **Tela A** (`/chat`): lista de conversas, busca e filtros de atendimento já existentes na coluna esquerda.
- **Tela B** (`/chat/:conversationId`): thread em página própria, botão voltar para a lista, header simplificado reutilizando dados da conversa.
- **Composer:** `Textarea` com crescimento automático até limite (~120px), scroll interno; no mobile **Enter** envia, **Shift+Enter** nova linha.

## 9. Checklist de implementação

- [x] Documentos `README`, `PHASE-01`, `STATUS`
- [x] Bottom nav com 5 destinos + sheet Mais agrupado
- [x] Sem Planos no mobile; sem FAB
- [x] Rota `/chat/:conversationId`
- [x] Chat: lista vs thread no mobile; desktop inalterado em comportamento geral
- [x] Composer auto-grow (mobile + desktop textarea; atalho Enter só mobile)
- [x] Home mobile: atalhos + resumo operacional; gráficos não dominam no telefone

## 10. Checklist de validação

- [x] “Planos” ausente do bottom e do Mais mobile
- [x] Bottom: Início, Clientes, Cobranças, Chat, Mais (itens condicionais a feature + `canView`; “Início” sem dashboard aponta para `/`)
- [x] Mais abre e navega por grupos
- [x] Desktop: sidebar e rotas preservadas
- [x] Home mobile mais orientada a ações
- [x] Chat em duas telas no mobile
- [x] Composer com auto-grow
- [x] Tema claro/escuro (componentes existentes + classes sem hardcode que quebre dark)
- [x] `npm run build` (Vite produção) executado com sucesso em 2026-04-25
- [x] Navegação desktop sem regressão intencional

## 11. Status

| Área              | Estado     |
|-------------------|------------|
| Documentação      | concluído  |
| Nav mobile        | concluído  |
| Home mobile       | concluído  |
| Chat mobile       | concluído  |
| Validação build   | concluído  |

## Arquivos criados/alterados

| Arquivo | Ação |
|---------|------|
| `docs/mobile-ux/README.md` | criado |
| `docs/mobile-ux/STATUS.md` | criado |
| `docs/mobile-ux/PHASE-01-mobile-foundation.md` | criado |
| `src/components/navigation/MobileAppNavigation.tsx` | alterado |
| `src/App.tsx` | alterado |
| `src/pages/Chat.tsx` | alterado |
| `src/pages/Dashboard.tsx` | alterado |

## Rotas / áreas impactadas

- `/dashboard` (layout mobile)
- `/chat`, `/chat/:conversationId`, `/chat/kanbam` (ordem de rotas)
- Navegação global mobile (`AppLayout`)

## Pendências sugeridas para PHASE-02

- Sheet de filtros no chat mobile.
- Otimização de viewport com teclado virtual.
- Primeiras telas lista→detalhe em Cobranças/Clientes no mobile.
