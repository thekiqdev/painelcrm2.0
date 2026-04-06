# Plano de Ajustes — Chat, Perfil e Navegação

## 1. Objetivo

Consolidar um plano técnico **incremental e seguro para produção** para corrigir inconsistências de UX, navegação, ordenação de conversas, prévia da última mensagem e exibição de nome/foto no **Chat** e no **CRM**, em um **SaaS multi-tenant**, **sem refatorar arquitetura desnecessariamente** e **preservando** o que já foi entregue nas fases anteriores (matching/vínculo, timeline, financeiro no chat, etc.).

Este documento **não implementa** mudanças; apenas define o escopo, investigação, impacto e ordem de execução.

---

## 2. Estado atual (referência rápida)

- **Chat (`Chat.tsx`)**: exibe identificador da conversa com fallback (`contactName` → `profileName` → `phoneNumber` → `external_chat_id`); avatar combina CRM (`currentClient`) com WhatsApp (`selectedConversation.avatarUrl`); existe ação **“Remover vínculo”** visível no header quando há `client_id` ou `lead_id`.
- **Backend conversas (`getConversations` em `chatController.ts`)**: lista com `ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.updated_at DESC` e campos `last_message_preview` / `last_message_at` expostos.
- **Mensagens (`saveMessage`)**: atualiza `last_message_preview` e `last_message_at` na conversa; há lógica de `COALESCE` em updates que pode **não sobrescrever** preview/data se o payload vier vazio em certos fluxos.
- **Menu lateral (`AppLayout.tsx`)**: grupos na ordem atual aproximada: **Vendas** → **Projetos** → **Atendimento** → … (demais grupos).
- **Perfil do cliente (`ClientProfile.tsx` + `ClientSidebar`)**: navegação por rota `/clients/:id/:tab`; botão **Voltar** no topo navega para `/clients` de forma fixa; header textual “Perfil do Cliente” sem avatar dedicado no topo além do conteúdo das abas.
- **Navegação a partir do chat**: `navigate('/clients/:id')` sem estado de origem — o botão voltar do perfil não distingue “veio do chat” vs “veio da listagem”.

---

## 3. Problemas identificados (sintomas → hipóteses)

| Área | Sintoma | Hipótese principal |
|------|---------|-------------------|
| Nome na conversa | Às vezes só número nos primeiros atendimentos | Vínculo ainda não persistido/ carregado; fallback para telefone antes do CRM; perfil assíncrono (`loadConversationProfile`) |
| Foto na conversa | Inconsistência entre telas | Ordem de prioridade entre CRM e `metadata`/avatar WhatsApp não unificada em um único “resolver” |
| Ordenação | Lista não parece “última atividade” | `last_message_at` desatualizado ou `COALESCE` em UPDATE preservando valor antigo; ordenação só no backend enquanto UI reordena em memória |
| Prévia | Preview não bate com última mensagem | `last_message_preview` não atualizado em todos os caminhos (API, webhook, sync); ou mensagem sem `body` |
| Voltar no perfil | Volta para Clientes quando veio do Chat | Ausência de `location.state` / query param de origem |
| Menu | Ordem não desejada | Ordem fixa dos `SidebarGroup` em `AppLayout.tsx` |
| Remover vínculo | Ação destrutiva em destaque | Produto quer simplificar; endpoint ainda necessário para suporte |

---

## 4. O que já existe e pode ser reaproveitado

- **Modelo de dados**: `chat_conversations` com `client_id`, `lead_id`, `phone_number`, `contact_name`, `profile_name`, `metadata` (incl. foto WhatsApp), `last_message_at`, `last_message_preview`.
- **Matching / vínculo (fases anteriores)**: serviços e metadados de `link_state`, `link_source` — não reinventar; apenas alinhar **exibição** e **carregamento de perfil**.
- **Política de foto já discutida**: CRM primeiro, WhatsApp como fallback — formalizar num helper único no frontend (e opcionalmente campo explícito na API).
- **Ordenação no SQL**: já existe critério baseado em `last_message_at`; provável que o bug seja **consistência de escrita** do timestamp/preview, não a query em si.
- **Timeline (Etapa 4)**: pode receber eventos futuros de “exibição corrigida” se necessário, mas **fora do escopo** deste plano de UX.

---

## 5. Blocos de ajuste

### 5.1 Remoção do botão “Remover vínculo”

**Objetivo**: tirar a ação destrutiva do fluxo principal.

**Investigar**

- Onde o botão é renderizado (`Chat.tsx`, header ao lado de sync/menu).
- Quem chama `chatService.unlinkConversation` e tratamento de erro/toast.
- Se há outros pontos (mobile, atalhos, documentação interna).

**Decisão de produto**

- **Padrão**: remover do UI principal.
- **Se necessário manter para suporte**: colocar em **menu secundário** (ex.: “Avançado” dentro do mesmo dropdown de ações) ou tela de administração — não como botão ghost visível ao lado de ações frequentes.

**Impacto**

- Backend: manter `DELETE /api/chat/conversations/:id/link` (compatibilidade); opcionalmente proteger com permissão/flag de tenant no futuro (fora do MVP deste plano).

---

### 5.2 Nome e foto corretos na conversa

**Objetivo**: resolver **uma vez** a identidade exibida na conversa ativa, incluindo **lista de conversas** e **cabeçalho**.

**Investigar**

- Origem do nome: `selectedConversation` vs `currentClient` / `currentLead` carregados por `getConversationProfile`.
- Momento do carregamento: race entre seleção da conversa e `loadConversationProfile`.
- Quando mostrar número: apenas se `client_id` e `lead_id` ausentes **e** não houver `contact_name`/`profile_name` úteis.

**Regras desejadas (contrato de UI)**

1. Se `client_id` → nome do **cliente** (CRM) como primário; conversa pode manter `contact_name` como subtítulo opcional.
2. Se `lead_id` (sem cliente) → nome do **lead** (CRM).
3. Avatar: **CRM** (`avatar_url` / `photo`) > **WhatsApp** (`metadata` / campo derivado na conversa).
4. Se sem vínculo → `contact_name` / `profile_name` / último recurso telefone formatado.

**Regra visual explícita para lista de conversas**

- Avatar à esquerda.
- Nome na linha principal.
- Telefone na linha secundária.
- Fallback de avatar: CRM > WhatsApp > placeholder.
- Mesmo padrão visual também no cabeçalho da conversa (com variação apenas de tamanho/layout).

**Implementação futura (conceitual)**

- Extrair função `resolveConversationDisplay(conv, client, lead)` no frontend (única fonte).
- Garantir que, ao selecionar conversa, o perfil CRM seja carregado antes de pintar o header ou usar skeleton até `currentClient/currentLead` resolvidos.

---

### 5.3 Foto do WhatsApp em cliente e lead (sem sobrescrever CRM)

**Objetivo**: mostrar foto do WhatsApp nos perfis como **fallback visual**, alinhado ao chat.

**Investigar**

- Onde a foto WhatsApp já é persistida (`metadata.whatsapp_profile_photo` ou similar no upsert/sync).
- Modelos `clients` e `leads`: campos de foto atuais; ausência de campo “foto externa”.

**Opções (escolher na implementação — plano recomenda a mais segura)**

- **Opção A (menor risco)**: apenas **UI** — no perfil, buscar conversa vinculada (por `client_id` / telefone) e exibir avatar WhatsApp ao lado do avatar CRM quando CRM não tiver foto, **sem gravar** no cadastro.
- **Opção B**: coluna opcional `external_avatar_url` / `whatsapp_avatar_url` em `clients` e `leads`, preenchida só por sync explícito, nunca sobrescrevendo `avatar_url` principal.
- **Opção C**: JSON `metadata` no cliente com `sources.whatsapp_profile_photo` (versão futura).

**Consistência**

- Mesma ordem de prioridade que no chat: CRM > WhatsApp > placeholder.
- Aplicar explicitamente em **`/clients/:id`** e também em **`/leads/:id`** (ou rota equivalente existente no sistema), mantendo a foto CRM como principal.

---

### 5.4 Reordenação do menu lateral

**Objetivo**: **Vendas** → **Atendimento** → **Projetos** (e demais grupos inalterados na medida do possível).

**Onde alterar**

- `src/layouts/AppLayout.tsx`: blocos `<SidebarGroup>` — hoje **Projetos** aparece antes de **Atendimento**; inverter a ordem dos grupos ou mover o bloco inteiro.

**Avaliar**

- Permissões: `show(hasChat, …)` etc. não mudam, só ordem visual.
- Pré-carregamento (`routePreload`): manter imports associados aos mesmos itens.

**Risco**: baixo — mudança puramente de ordem de JSX.

---

### 5.5 Ordenação correta das conversas

**Objetivo**: lista sempre com **última atividade real** primeiro.

**Investigar**

- Query atual: `ORDER BY COALESCE(last_message_at, created_at) DESC` (backend).
- Todos os caminhos que **gravam** `last_message_at`: `saveMessage`, sync Uazapi, importação, webhooks.
- Frontend: se há `sort()` adicional em `Chat.tsx` que conflita com o backend.

**Correções prováveis**

- Garantir que **toda** mensagem persistida atualize `last_message_at` com o timestamp efetivo da mensagem (não `COALESCE` que preserve antigo quando o novo payload tem data).
- Incluir na investigação mensagens só com mídia/metadata sem `body` (preview).
- Opcional: índice em `(user_id, last_message_at DESC)` se volume exigir (avaliar após correção lógica).

---

### 5.6 Prévia correta da última mensagem

**Objetivo**: `last_message_preview` = texto (ou label padronizado) da **última** mensagem da conversa.

**Investigar**

- `saveMessage`: hoje usa `COALESCE` em updates de conversa — pode impedir atualização se preview vier `null`.
- Sync de conversas Uazapi: se sobrescreve preview com valor mais antigo.
- Frontend: se usa outro campo para preview na lista.

**Correções prováveis**

- Regra: ao inserir/atualizar mensagem, **sempre** setar preview derivado do último evento (ou subquery `MAX(sent_at)` se necessário em job de correção).
- Alinhar ordenação e preview na mesma fonte de verdade (`last_message_at` + preview derivado do mesmo evento).

---

### 5.7 Foto em pontos importantes do perfil

**Objetivo**: reforçar identidade visual — avatar ao lado do nome no topo e coerência com o chat, tanto em cliente quanto em lead.

**Investigar**

- `ClientProfile.tsx`: header com nome e badge; falta avatar explícito.
- `ClientSidebar.tsx`: só texto “Perfil do Cliente”.
- Página de perfil de lead (`/leads/:id` ou equivalente): confirmar pontos de header/subheader sem avatar.

**Implementação futura (conceitual)**

- Avatar circular no header usando foto CRM; se sem foto, placeholder ou WhatsApp (conforme 5.3).
- Opcional: pequena legenda “Foto do WhatsApp” quando for fallback (acessibilidade / clareza).
- Repetir o padrão de bloco de identidade no perfil de lead para evitar divergência entre entidades CRM.

---

### 5.8 Navegação correta do botão “Voltar” no perfil do cliente

**Objetivo**: se o usuário abriu o perfil **a partir do chat**, voltar para **`/chat`** (idealmente com conversa ainda selecionada); se veio de **Clientes**, voltar para **`/clients`**.

**Investigar**

- Todas as entradas: `navigate(\`/clients/${id}\`)` a partir de `Chat.tsx` (vários pontos).
- Rotas em `App.tsx`: `/clients/:id` e `/clients/:id/:tab`.

**Abordagens recomendadas (por ordem de simplicidade)**

1. **`location.state`**: `navigate('/clients/:id', { state: { from: 'chat', conversationId?: string } })` — no `ClientProfile`, botão Voltar lê `state` e navega para `/chat` (e opcionalmente restaura conversa via state global ou query `?conversation=`).
2. **Query string**: `/clients/:id?from=chat&conversationId=` — bookmarkável, mais visível.
3. **`sessionStorage` temporário** — útil se `state` se perder em refresh (documentar trade-off).

**Riscos**

- Refresh na página do cliente pode perder `state` — documentar ou combinar com query param.

---

### 5.9 Padronização visual de identidade (avatar, nome, telefone)

**Objetivo**: estabelecer uma regra única para evitar que cada tela resolva identidade de forma diferente.

**Campos visuais padrão**

- Avatar.
- Nome principal.
- Telefone secundário.

**Prioridade de avatar**

1. Foto do CRM.
2. Foto do WhatsApp.
3. Placeholder.

**Prioridade de nome**

1. Nome do cliente.
2. Nome do lead.
3. `contact_name` / `profile_name`.
4. Telefone formatado.

**Escopo de aplicação**

- Lista de conversas.
- Cabeçalho da conversa.
- Perfil do cliente.
- Perfil do lead.
- Buscas de clientes e leads.
- Seletores em modal.
- Resultados de vínculo manual.
- Listas de entidades CRM usadas no fluxo Chat + CRM + Atendimento.

**Diretriz técnica**

- Centralizar a resolução em um helper único de frontend (ex.: `resolveIdentityDisplay`) e reaproveitar em componentes de lista, header, perfil e busca.
- Sem refatoração estrutural ampla: apenas padronização incremental dos componentes existentes.

---

## 6. Impacto técnico por camada

### Banco

- Possível evolução: colunas ou `metadata` para foto WhatsApp em cliente/lead (**se** optar por persistir; ver 5.3).
- Índice auxiliar em `chat_conversations (user_id, last_message_at DESC)` apenas se medição mostrar necessidade.

### Backend

- Revisar `saveMessage` e fluxos de sync para **consistência** de `last_message_at` / `last_message_preview`.
- Opcional: endpoint leve “avatar WhatsApp por client_id” para perfil sem duplicar lógica no frontend.
- Manter APIs de vínculo; sem remoção obrigatória de rotas.

### Frontend

- `Chat.tsx`: resolver display unificado; incluir padrão visual na lista (avatar + nome + telefone); remover/reposicionar “Remover vínculo”; alinhar lista com backend; opcional estado de navegação ao abrir cliente.
- `ClientProfile.tsx` / `ClientSidebar.tsx`: avatar + voltar condicional.
- Perfil de lead e componentes de busca/seleção: aplicar padrão de identidade visual unificado.
- `AppLayout.tsx`: reordenar grupos do menu.

### Navegação / roteamento

- Uso de `location.state` ou query para origem do perfil; documentar comportamento ao refresh.

---

## 7. Riscos e cuidados

- **Regressão em vínculo manual**: mudanças na UI não devem alterar regras de `link_state` / matching.
- **Multi-tenant**: qualquer query nova para foto/preview deve filtrar por tenant/usuário como hoje.
- **Performance**: evitar N+1 de perfis ao renderizar lista de conversas; prefetch só para conversa selecionada.
- **Dados sensíveis**: foto WhatsApp como dado derivado — política de retenção alinhada ao produto.

---

## 8. Ordem recomendada de implementação

1. **Inventário e instrumentação** (logs temporários ou QA checklist): mapear exatamente quando `last_message_at` / preview falham.
2. **Correção backend** de preview + timestamp (base para 5.5 e 5.6).
3. **Definir helper único de identidade visual** (5.9) e aplicar primeiro na conversa (lista + cabeçalho) (5.2).
4. **Expandir padrão para perfil de cliente e lead** com fallback WhatsApp (5.3 + 5.7).
5. **Padronizar buscas e seletores** (clientes, leads, vínculo manual) com avatar + nome + telefone (5.9).
6. **Menu lateral** (5.4) — mudança rápida e isolada.
7. **Navegação Voltar** (5.8).
8. **Remover vínculo** da UI principal / realocar (5.1).

---

## 9. Fases sugeridas

| Fase | Conteúdo | Critério de saída |
|------|----------|-------------------|
| **Fase A** | Diagnóstico + correção `last_message_*` | Ordenação e preview batem com última mensagem em testes manuais |
| **Fase B** | Regra única de identidade na conversa (lista + cabeçalho) | Lista e header seguem avatar + nome + telefone com fallback correto |
| **Fase C** | Perfil cliente/lead + fallback WhatsApp | Visual alinhado ao chat, sem overwrite CRM |
| **Fase D** | Padronização de buscas e seletores CRM | Resultados com avatar + nome + telefone em todos os pontos do fluxo |
| **Fase E** | Navegação voltar + limpeza “Remover vínculo” | Fluxos chat ↔ cliente sem regressão |
| **Fase F** | Menu lateral | Ordem conforme produto |

### 9.1 Fase D — entregue neste ciclo (parcial)

- **Helper** `formatCrmIdentitySecondaryLine` em `src/utils/chatIdentityDisplay.ts` (telefone formatado → e-mail → empresa).
- **Componente** `src/components/crm/CrmIdentityListRow.tsx`: avatar (CRM → WhatsApp → iniciais) + nome + linha secundária.
- **`ClientSearchCombobox`**: itens do dropdown e gatilho (modo botão) com o padrão acima; modo `searchInTrigger` com mini-avatar à esquerda do input quando há seleção.
- **`Chat.tsx`** — diálogo “Vincular conversa”: listas de clientes e leads com o mesmo padrão.

**Pendência opcional**: `Select`/`SelectItem` que recebem só `{ id, name }` (ex.: alguns fluxos de tarefa) podem ser alinhados quando a lista passar o `Client` completo com `whatsapp_avatar_url`.

### 9.3 Fase F — entregue neste ciclo

- **Menu lateral** (`AppLayout.tsx`): ordem dos grupos **Vendas** → **Atendimento** (Chat, Tickets) → **Projetos** (Projetos, Tarefas, Templates); demais blocos (Dashboard, Documentação, Financeiro, Configurações) inalterados. Apenas reordenação de JSX; permissões e `routePreload` mantidos por item.

### 9.2 Fase E — entregue neste ciclo

- **Voltar no perfil do cliente**: `Chat` abre o perfil com `?from=chat&conversation=<id>` e `state: { from: 'chat', conversationId }` (`clientProfileNavigation.ts`). O botão/sidebar “Voltar” usa `navigateBackFromClientProfile`: retorna a `/chat` com `state.openConversationId` para reselecionar a conversa; caso contrário `/clients`. A query é **preservada** nas abas do `ClientSidebar` para não perder o contexto ao trocar de aba.
- **Remover vínculo**: ação **somente** no menu ⋮ da conversa (“Remover vínculo com CRM”), com diálogo de confirmação; chama `DELETE .../link` existente. Não fica como botão principal no header.

---

## 10. Recomendação final

Priorizar **Fase A (dados de última mensagem)** antes de iterar em UI fina: quando `last_message_at` e o preview estiverem sempre corretos, **ordenção e lista** refletem a realidade e reduzem “sensação de bug” no chat. Em paralelo, tratar **nome/foto** como uma camada única de apresentação no frontend para evitar divergência entre lista e cabeçalho. Por último, **menu** e **voltar** são ajustes de baixo risco após estabilizar dados e identidade visual.

**Não implementar** arquitetura nova de “identity service” neste ciclo; evoluir incrementalmente sobre `chat_conversations` + perfis CRM já existentes.
