# Atualização da Plataforma — v1.1.4.1

## Resumo

Esta versão consolida melhorias na **experiência mobile**, no **dashboard executivo**, no **módulo financeiro**, no **fluxo comercial** (propostas, faturas e contratos), na **gestão de assinaturas e recorrência**, e introduz o canal **Anúncios e Atualizações** com **notificações no sininho**. Inclui ainda correções e reforços em cobranças recorrentes, notificações e segurança de links públicos de propostas.

---

## Novidades

- **Anúncios e Atualizações**: área para comunicados da plataforma; leitura no painel e fluxo de detalhe.
- **Notificações no sininho**: suporte a notificações ligadas a anúncios/atualizações, com integração ao serviço de notificações.
- **SuperAdmin — gestão de anúncios** (quando aplicável ao seu ambiente): grupos, envios e editor alinhados ao novo módulo.
- **Atalhos rápidos no dashboard**: painel de ações rápidas com preferências guardadas pelo utilizador.
- **Contexto mobile reforçado**: shell comercial (fullscreen, navegação inferior oculta em fluxos dedicados) para criar/editar fluxos com melhor ergonomia em telemóvel.
- **Chat — fluxos comerciais**: criação de **proposta** e **fatura** a partir da conversa alinhada ao mesmo padrão visual das rotas globais (incluindo mobile), com contexto da conversa e indicação discreta de origem.

---

## Melhorias

- **Dashboard executivo**: blocos operacionais e permissões mais coerentes com o papel do utilizador (ver documentação interna `DASHBOARD_PERMISSOES_E_BLOCOS_OPERACIONAIS.md` se existir no repositório).
- **Dashboard / mobile**: refinamentos de layout e navegação móvel em linha com o plano de UX mobile.
- **Financeiro profissional**: páginas unificadas de **contas / bancos** e **entradas e despesas** com ajustes de usabilidade.
- **Faturas e assinaturas**: fluxo de **nova fatura**, recorrência e ligação a cobranças; mensagens e estados mais claros onde aplicável.
- **Propostas e contratos**: formulários, itens e detalhes com melhorias de layout e consistência (incluindo mobile).
- **Propostas — link público**: endurecimento do armazenamento do token de link (migração dedicada).
- **Tarefas, projetos, tickets**: pequenos ajustes de UI e fluxos de detalhe.
- **Plano do tenant / faturação SaaS** (backend): atualizações no controlador e serviços associados quando relevante ao estado de cobrança.

---

## Correções

- **Propostas**: correção do controlo da **bottom navigation** no mobile em conjunto com o formulário de criação (evita conflito entre página e formulário).
- **Recorrência / faturas**: reforços no serviço de jobs de cobrança recorrente e estados em atraso (`billingOverdueStatusService` e afins) conforme implementado nesta release.
- **Notificações**: alinhamento de rotas e serviço para o novo tipo de entidade (anúncios).
- **Chat**: conteúdo de bolhas e perfil de contacto com melhorias pontuais.

---

## Impacto para o utilizador

- Pode **ver atualizações da plataforma** num sítio dedicado e ser **alertado pelo sininho** quando houver novidades.
- No **dashboard**, pode **personalizar atalhos** para as ações que mais usa.
- Em **telemóvel**, criar **faturas**, **propostas** e navegar em fluxos comerciais fica **mais previsível e próximo da app**.
- A partir do **Chat**, criar **proposta** ou **fatura** mantém o **mesmo aspeto** que nas páginas globais, com **menos fricção** e contexto da conversa.
- **Assinaturas e faturas recorrentes** beneficiam de comportamento e mensagens mais estáveis.

---

## Observações técnicas

- Novas **migrações SQL** (Supabase e/ou `database/init`): módulo de anúncios, extensão de notificações para entidade de anúncio, ciphertext do token de link público de propostas — **executar em ordem** nos ambientes de deploy.
- Backend: novos controladores e rotas para `announcements`/updates; ajustes em `notifications`, `recurringBillingJobService`, `customerInvoices`, `dashboard`, `chat`, `proposals`.
- Frontend: `MobileShellChromeContext`, componentes em `mobile/`, páginas `UpdatesPage` / `UpdateDetailPage`, serviços `announcementsUpdates` / `announcementsAdmin`, integração no `AppLayout` e rotas.
- Sem inclusão de ficheiros `.env` ou credenciais no repositório (mantidos no `.gitignore`).

---

## Mensagem curta para WhatsApp

🚀 **Nova atualização disponível!**

Publicámos melhorias importantes na plataforma: **anúncios e atualizações** com **notificações no sininho**, **atalhos rápidos no dashboard**, refinamentos no **financeiro**, na **experiência mobile** e nos fluxos de **faturas, propostas e contratos** — incluindo criação **a partir do Chat**, alinhada ao resto do sistema.

Fica mais simples **acompanhar cobranças e assinaturas**, **organizar o financeiro** e **ver o que importa** num só sítio.

Aceda ao sistema e veja as novidades em:  
**Perfil → Atualizações**

---

*Documento gerado para release **v1.1.4.1** — branch `deploy-v1.1.4.1`.*
