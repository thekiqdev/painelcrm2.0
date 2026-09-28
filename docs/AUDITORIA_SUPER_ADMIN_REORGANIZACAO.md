# Auditoria investigativa — Reorganização do Painel Super Admin (PainelCRM)

**Data da auditoria (código):** abril de 2026  
**Escopo:** levantamento apenas — **sem alterações implementadas** nesta etapa.  
**Guard de acesso:** `SuperAdminGuard` (`src/components/SuperAdminGuard.tsx`) — exige `user.is_super_admin`; caso contrário redireciona para `/dashboard`.  
**Layout:** `SuperAdminLayout` (`src/layouts/SuperAdminLayout.tsx`) — sidebar fixa + `<Outlet />`.  
**Prefixo de API:** rotas Express montadas em `/api/superadmin` (ver `packages/backend/src/routes/superadminRoutes.ts`) e `/api/superadmin/tenants` via `tenantsRoutes` (superadmin).

---

## 1. Visão geral atual

### Como está organizado hoje

- O Super Admin é um **módulo isolado** sob a rota base **`/superadmin`**, com layout próprio (sem sidebar do tenant).
- A navegação principal está **quase toda em uma única lista “Painel”** (10 itens), mais um segundo grupo **“Configurações”** (6 itens). Não há submenus colapsáveis na sidebar: tudo é link direto.
- O **detalhe da empresa (tenant)** usa um layout aninhado (`SuperAdminClientLayout`) com **abas internas** (Resumo, Faturamento, Usuários, Configurações, Recursos, Limites, Observações, Logs).
- Várias rotas de **anúncios** e **edição de plano** existem como rotas irmãs, mas **só parte delas aparece no menu**; outras são alcançadas por links dentro das páginas.
- A página **“Notificações da plataforma”** concentra múltiplos domínios (catálogo, envios, WhatsApp da plataforma, toggles globais) num **ficheiro muito grande**, o que mistura “comunicação”, “integração WhatsApp” e “observabilidade” na mesma entrada de menu.
- Existe distinção no backend e na UI entre:
  - **Motor de notificações dos tenants (CRM)** — toggles em “Motor CRM (tenants)” + templates em “Templates padrão (CRM)”.
  - **Notificações da plataforma** (`platform.*`) — rota “Notificações da plataforma”.
- **Pagamentos** no menu leva à configuração do **gateway de cobrança SaaS** (Asaas/Mercado Pago, etc.), não à lista de faturas dos tenants (esta última está mais ligada a “Cobranças da plataforma” e ao detalhe por empresa).

### Principais grupos de telas (conceituais)

| Grupo conceitual | Onde aparece hoje |
|------------------|-------------------|
| Visão geral / métricas | Dashboard, Relatórios |
| Comercial (planos, empresas) | Planos, Empresas (+ sub-rotas), Features globais |
| Financeiro SaaS | Cobranças da plataforma, Pagamentos (gateway), Ciclos de assinatura |
| Comunicação e notificações | Notificações (in-app), Anúncios, Notificações da plataforma, Motor CRM, Templates CRM |
| Conteúdo legal | Páginas legais |
| Segurança / acesso | Super Admins, Auditoria (+ logs por tenant) |
| Operações / engenharia | (parcial) APIs de motor com telas incompletas — ver secção 3 |

### Menus atuais na sidebar (`SuperAdminLayout`)

**Grupo “Painel”**

1. Dashboard → `/superadmin`
2. Planos → `/superadmin/plans`
3. Empresas → `/superadmin/clients`
4. Cobranças da plataforma → `/superadmin/platform-billings`
5. Features → `/superadmin/features`
6. Auditoria → `/superadmin/audit`
7. Relatórios → `/superadmin/reports`
8. Super Admins → `/superadmin/users`
9. Notificações → `/superadmin/notifications`
10. Anúncios → `/superadmin/announcements`

**Grupo “Configurações”**

1. Pagamentos → `/superadmin/pagamentos`
2. Notificações da plataforma → `/superadmin/platform-notifications`
3. Motor CRM (tenants) → `/superadmin/notifications-engine`
4. Templates padrão (CRM) → `/superadmin/notification-templates`
5. Ciclos de assinatura → `/superadmin/subscription-cycles`
6. Páginas legais → `/superadmin/configuracoes/legal`

**Entrada no app tenant:** menu do utilizador em `AppLayout` — item “Super Admin” quando `user.is_super_admin` (navega para `/superadmin`).

---

## 2. Mapa atual de menus e rotas

Legenda **Menu:** `sim` = link direto na sidebar; `sub` = sub-rota ou tab dentro de layout; `interno` = acessível só por links noutras páginas.

| Área atual | Rota | Componente / página | Função resumida | Observações |
|------------|------|---------------------|-----------------|-------------|
| Painel | `/superadmin` | `SuperAdminDashboard` | Totais (planos, tenants, utilizadores), listas recentes | Consome `GET /api/superadmin/dashboard` |
| Painel | `/superadmin/plans` | `SuperAdminPlans` | CRUD / gestão de planos comerciais | |
| Painel | `/superadmin/plans/:id/features` | `SuperAdminPlanFeatures` | Features por plano | **Menu:** interno (desde lista de planos) |
| Painel | `/superadmin/clients` | `SuperAdminClients` | Lista de empresas (tenants) | |
| Painel | `/superadmin/clients/new` | `SuperAdminClientNew` | Criar empresa | **Menu:** interno |
| Empresa | `/superadmin/clients/:id` | `SuperAdminClientLayout` | Shell + tabs da empresa | Redirect para `resumo` |
| Empresa | `.../resumo` | `SuperAdminClientResumo` | Resumo, status, atalhos | |
| Empresa | `.../configuracoes` | `SuperAdminClientConfiguracoes` | Dados e ajustes do tenant | Inclui navegação para features “avançadas” |
| Empresa | `.../faturamento` | `SuperAdminClientFaturamento` | Cobrança / histórico do tenant | |
| Empresa | `.../usuarios` | `SuperAdminClientUsuarios` | Utilizadores do tenant; **impersonação** | `POST /api/superadmin/impersonate` |
| Empresa | `.../recursos` | `SuperAdminClientRecursos` | Features ligadas ao tenant | Liga a rota “matriz” de edição |
| Empresa | `.../limites` | `SuperAdminClientLimites` | Limites por tenant | |
| Empresa | `.../observacoes` | `SuperAdminClientObservacoes` | Notas internas | |
| Empresa | `.../logs` | `SuperAdminClientLogs` | Audit log por tenant | Link “voltar” para auditoria global |
| Painel | `/superadmin/tenants/:id/features` | `SuperAdminTenantFeatures` | Matriz de features do tenant | **Menu:** interno (botões em Configurações/Recursos/legado) |
| Painel | `/superadmin/features` | `SuperAdminFeatures` | Catálogo global de **system features** (flags) | Nome “Features” em inglês; não confundir com features de plano |
| Painel | `/superadmin/audit` | `SuperAdminAudit` | Log de auditoria global (paginado) | |
| Painel | `/superadmin/reports` | `SuperAdminReports` | Relatórios adoção/receita/churn; exports | Usa `GET /api/superadmin/reports` e exports |
| Painel | `/superadmin/users` | `SuperAdminUsers` | Lista / criar / remover **super admins** | |
| Painel | `/superadmin/notifications` | `SuperAdminNotifications` | Notificações in-app filtradas `superadmin_*`; botão verificar trials | Usa também `GET /api/notifications` (tenant-agnostic filter no cliente) |
| Painel | `/superadmin/announcements` | `SuperAdminAnnouncements` | Lista de anúncios | Links para grupos, histórico, novo |
| Anúncios | `/superadmin/announcements/groups` | `SuperAdminAnnouncementGroups` | Grupos de destino | **Menu:** interno |
| Anúncios | `/superadmin/announcements/sends` | `SuperAdminAnnouncementSends` | Histórico de envios | **Menu:** interno |
| Anúncios | `/superadmin/announcements/sends/:sendId` | `SuperAdminAnnouncementSendDetail` | Detalhe de envio | **Menu:** interno |
| Anúncios | `/superadmin/announcements/new` | `SuperAdminAnnouncementEditor` | Criar/editar rascunho | **Menu:** interno |
| Anúncios | `/superadmin/announcements/:id/edit` | `SuperAdminAnnouncementEditor` | Editar | **Menu:** interno |
| Anúncios | `/superadmin/announcements/:id/send` | `SuperAdminAnnouncementSend` | Fluxo de envio | **Menu:** interno |
| Config. | `/superadmin/pagamentos` | `SuperAdminPagamentos` | Gateway SaaS (credenciais, métodos, ambiente) | APIs `payment-gateway*`, `payment-gateways*` |
| Config. | `/superadmin/platform-notifications` | `SuperAdminPlatformNotifications` | Catálogo platform, overrides, deliveries, settings globais; **painel WhatsApp plataforma embutido** | Componente `SuperAdminPlatformWhatsAppPanel` importado aqui |
| Config. | `/superadmin/notifications-engine` | `SuperAdminNotificationsEngineSettings` | Kill switches globais motor **tenant/CRM** | Só `global-settings`; ver APIs órfãs |
| Config. | `/superadmin/notification-templates` | `SuperAdminCrmNotificationTemplates` | Templates sistema CRM (e-mail/WhatsApp tenant) | |
| Config. | `/superadmin/subscription-cycles` | `SuperAdminSubscriptionCyclesSettings` | Flags leitura/escrita ciclos de assinatura | |
| Config. | `/superadmin/platform-billings` | `SuperAdminPlatformBillings` | Faturas/cobranças **da plataforma** (SaaS) | |
| Config. | `/superadmin/configuracoes/legal` | `SuperAdminLegalPages` | Editor páginas legais (draft/publish) | Redirect legado: `/admin/configuracoes/legal` → esta rota (`App.tsx`) |

### Código não ligado a rotas (órfão de rota)

| Ficheiro | Situação |
|----------|----------|
| `SuperAdminClientDetail.tsx` | **Não há `<Route>`** que o renderize; possível legado ou substituído por `SuperAdminClientLayout`. |
| `SuperAdminClientPlaceholder.tsx` | **Lazy import em `App.tsx`** mas **sem uso** em nenhuma rota — candidato a remoção futura após validação. |

### APIs Super Admin expostas sem UI dedicada (lacuna)

| API (resumo) | Observação |
|----------------|------------|
| `GET /api/superadmin/notifications-engine/summary` | Não encontrado consumo no frontend `src/`. |
| `GET /api/superadmin/notifications-engine/deliveries` | Idem — útil para suporte/diagnóstico motor CRM. |
| Várias sob `/api/superadmin/billing/*` (subscriptions, upcoming, jobs-failed, recurring-jobs, settings) | Verificar se alguma tela consome; relatórios operacionais possivelmente só API hoje. |

*(Confirmação fina: procurar por strings `billing/subscriptions` etc. no `src/` numa fase de implementação.)*

---

## 3. Problemas encontrados

1. **Sidebar “plana” e longa:** 10 itens no primeiro grupo sem agrupamento semântico (comercial, financeiro, comunicação, segurança misturados).
2. **Nomenclatura inconsistente:** “Features” (inglês) vs resto em português; “Notificações” (in-app) vs “Notificações da plataforma” (domínio diferente); “Motor CRM (tenants)” exige leitura da descrição para perceber fronteira com plataforma.
3. **Risco de confusão comercial vs técnico:** “Pagamentos” é gateway técnico; “Cobranças da plataforma” é negócio/faturação — utilizadores podem procurar “faturas” no sítio errado.
4. **Página monolítica:** `SuperAdminPlatformNotifications.tsx` agrega catálogo, histórico, simulações, settings e **WhatsApp da plataforma** — difícil manter, testar e documentar; UX pesada.
5. **Rotas de anúncios escondidas:** Grupos, histórico e envio só a partir da lista principal — bom para não poluir menu, mas **falta um “hub” explícito** de Comunicação.
6. **Duas superfícies para features de tenant:** `.../recursos` (visão resumida) vs `/superadmin/tenants/:id/features` (matriz) — fluxo correto mas **não óbvio** na primeira visita.
7. **Auditoria duplicada em conceito:** log global (`/audit`) vs log por empresa (`.../logs`) — falta rotular claramente “global” vs “por tenant” no menu (hoje só contexto da página).
8. **Componentes possivelmente mortos:** `SuperAdminClientDetail`, import fantasma de `SuperAdminClientPlaceholder` — dívida técnica e risco de confusão em futuras alterações.
9. **“Notificações” do menu** mistura **produto in-app** com **operação de trials** (botão “Verificar trials”) — útil mas visualmente parece “caixa de entrada”, não “operações”.
10. **Relatórios vs Dashboard:** ambos mostram números; falta hierarquia (dashboard = snapshot, relatórios = análise/export).
11. **Ícone “Building2”** em “Notificações da plataforma” não comunica bem “comunicação/plataforma”.
12. **Sem módulo “Integrações” explícito:** WhatsApp plataforma está **dentro** de notificações; gateways estão em “Pagamentos”; não há hub para “estado de integrações” (Google, Cora, etc.) mesmo que parte viva em settings de tenant.

---

## 4. Proposta de nova organização (estrutura de menus sugerida)

Objetivo: grupos **escaláveis**, nomes **em português consistente**, separação **Comercial / Financeiro / Comunicação / Plataforma / Segurança / Suporte**. Rotas **existentes** podem manter-se; mudaria-se sobretudo **agrupamento e rótulos** na sidebar e, mais tarde, **páginas hub**.

### Dashboard

- Visão geral (rota atual dashboard)
- Atalhos para alertas operacionais (ex.: trials — hoje em Notificações; pode migrar para widget no dashboard)
- (Futuro) indicadores críticos de motor/fila se as APIs `summary` forem expostas na UI

### Empresas (Tenants)

- Lista de empresas (`/clients`)
- Nova empresa (`/clients/new`)
- Detalhe da empresa (tabs atuais: resumo, faturamento, utilizadores — com impersonar, configurações, recursos, limites, observações, logs)
- (Manter) Matriz de features: ` /superadmin/tenants/:id/features` como “Avançado” ou sub-item do detalhe

### Comercial

- Planos (`/plans`)
- Features por plano (`/plans/:id/features`)
- Catálogo de recursos globais do sistema (`/features`) — renomear para algo como “Recursos do sistema” ou “Módulos e flags”
- (Futuro) cupons, trials, regras — se existirem só em DB sem UI, documentar no backlog

### Financeiro (SaaS)

- Cobranças / faturas da plataforma (`/platform-billings`)
- Gateway e métodos de pagamento (`/pagamentos`) — renomear menu para clareza
- Ciclos de assinatura — flags (`/subscription-cycles`)
- (Futuro) hub para jobs falhados / filas se as APIs `billing/*` ganharem UI

### Comunicação

- Anúncios e envios (hub com links para lista, grupos, histórico)
- Notificações in-app do super admin (`/notifications`) — renomear para “Alertas internos” ou “Avisos operacionais”
- **Sub-módulo Motor tenant (CRM):** toggles (`/notifications-engine`) + templates (`/notification-templates`)
- **Sub-módulo Plataforma:** notificações `platform.*` (`/platform-notifications`) — idealmente **sem** misturar WhatsApp no mesmo nível visual (tab ou rota filha)

### Integrações (novo grupo conceitual — pode começar como hub com cards)

- WhatsApp da plataforma (hoje embutido em platform-notifications)
- Gateways de pagamento (atalho ou embed resumido)
- (Links para docs/config tenant quando aplicável)

### Plataforma / Conteúdo

- Páginas legais (`/configuracoes/legal`)
- (Futuro) branding padrão, feature flags de ambiente — se existirem só no backend, listar no doc de produto

### Segurança e acesso

- Super Admins (`/users`)
- Auditoria global (`/audit`)
- (Política) impersonação documentada como ação em “Utilizadores do tenant”, não como página isolada

### Relatórios e dados

- Relatórios e exportações (`/reports`)

### Suporte / Operações (fase posterior)

- Logs técnicos motor CRM (`summary` / `deliveries` API)
- Diagnóstico por empresa (já existe `.../logs`; reforçar navegação)
- Erros de billing (`billing/jobs-failed` etc.) quando houver UI

---

## 5. Proposta de renomeação de menus

| Nome atual (sidebar) | Nome sugerido | Motivo |
|----------------------|---------------|--------|
| Features | Recursos do sistema (ou Módulos globais) | Evitar inglês e confusão com “features do plano” |
| Cobranças da plataforma | Faturas SaaS / Cobranças PainelCRM | Alinhar linguagem com “faturação” |
| Pagamentos | Gateway de pagamento (SaaS) | Deixa claro que é configuração técnica, não extrato |
| Notificações | Alertas internos / Operação (trials) | Diferenciar de notificações WhatsApp/e-mail |
| Notificações da plataforma | Notificações da plataforma (e-mail & WhatsApp) | Ou dividir em duas entradas se o hub for separado |
| Motor CRM (tenants) | Motor de notificações (tenants) | “CRM” pode não ser óbvio para todo o staff |
| Templates padrão (CRM) | Templates padrão (clientes finais) | Esclarecer que são templates do negócio do tenant |
| Super Admins | Administradores da plataforma | Tom mais profissional |
| Anúncios | Comunicados aos clientes | Opcional — “Anúncios” já é aceitável |

---

## 6. Proposta de agrupamento de funções

| Função atual | Onde está hoje | Onde deveria ficar | Motivo |
|--------------|----------------|-------------------|--------|
| Lista / gestão de planos | Planos | Comercial | Agrupamento natural |
| Features por plano | Rota filha de planos | Comercial | Já está correta na rota; só falta hierarquia no menu |
| System features (flags globais) | Painel → Features | Comercial ou Plataforma | Decisão: se afeta vendas → Comercial; se é engenharia → Plataforma |
| Gateway SaaS | Configurações → Pagamentos | Financeiro (técnico) | Junto a faturação SaaS |
| Faturas plataforma | Painel → Cobranças | Financeiro | Unificar mental model |
| Toggles motor tenant | Motor CRM | Comunicação → Motor tenants | Junto de templates |
| Templates CRM sistema | Templates padrão | Comunicação → Motor tenants | Mesmo domínio |
| Catálogo platform + deliveries | Notificações plataforma | Comunicação → Plataforma | Separar visualmente de motor tenant |
| WhatsApp instância plataforma | Dentro de Notif. plataforma | Integrações ou sub-tab | Reduz monólito |
| Páginas legais | Configurações | Plataforma / Conteúdo | Não é “config técnica” de pagamentos |
| Audit log global | Auditoria | Segurança | |
| Audit log tenant | Empresa → Logs | Empresas → Suporte/detalhe | |
| Impersonar | Empresa → Utilizadores | Empresas (ação) | Manter; documentar risco |
| Verificar trials | Notificações | Dashboard widget ou Comercial | Menos ruído na caixa de alertas |
| Relatórios / export | Relatórios | Relatórios | OK |
| Anúncios / grupos / envios | Várias rotas | Comunicação (hub) | Descoberta |

---

## 7. Melhorias de UX recomendadas

- **Separar** na UI: configuração **gateway** vs **extrato/cobranças** vs **motor de mensagens** (3 coisas diferentes).
- **Criar páginas índice** (hubs) para: Comunicação, Financeiro SaaS, Integrações — mesmo que inicialmente só mostrem cards com links para rotas atuais (sem mudar URLs).
- **Tenant detail:** breadcrumb claro `Super Admin > Empresas > {nome} > Aba`; considerar indicador “Features: editar matriz” mais visível.
- **Platform notifications:** dividir em **tabs** com títulos explícitos (Catálogo | Envios | Definições | WhatsApp plataforma) ou rotas filhas — já pode haver tabs internos; avaliar se o ficheiro deve ser **partido em componentes** por domínio.
- **Padronizar** cards, tabelas e filtros entre páginas do super admin (hoje há mistura de estilos herdados).
- **Reduzir itens de primeiro nível** na sidebar para 5–7 grupos com **accordions** ou labels de secção mais fortes.
- **Eliminar código morto** após validação (`SuperAdminClientDetail`, import de `Placeholder`).
- **Expor** (fase futura) `notifications-engine/summary` e `deliveries` para suporte — hoje só API.

---

## 8. Plano seguro de implementação

### Fase 1 — Auditoria e documentação

- Concluído com este documento.  
- **Sem alteração funcional.**

### Fase 2 — Reorganização visual da sidebar

- Reordenar e **agrupar** labels; opcionalmente ícones.  
- **Manter todas as rotas e URLs** existentes.  
- Risco: baixo se só mudar `SuperAdminLayout.tsx`.

### Fase 3 — Criação de hubs

- Novas páginas “índice” (ex.: `/superadmin/comunicacao`, `/superadmin/financeiro`) que **apontam** para rotas atuais **ou** redirects suaves.  
- Evitar duplicar lógica de negócio.

### Fase 4 — Migração gradual de telas

- Extrair WhatsApp plataforma para rota ou tab dedicada **sem** quebrar URL antiga (ex.: query `?tab=whatsapp` ou redirect interno).  
- Partir `SuperAdminPlatformNotifications` em módulos menores.

### Fase 5 — Limpeza final

- Remover imports/ componentes órfãos.  
- Opcional: aliases de rota antiga com `Navigate` durante período de transição.  
- **Não remover** endpoints de API sem coordenação com backend.

---

## 9. Riscos de alteração futura (registro)

- **Impersonação:** mudanças de menu não devem esconder o fluxo; exigir confirmação/auditoria em qualquer redesign.  
- **Duplo domínio de notificações** (tenant vs platform): erro de copy pode levar a desligar o motor errado.  
- **APIs sem UI:** remover ou renomear rotas backend sem checar consumidores externos (se existirem).  
- **Redirect** `/admin/configuracoes/legal` → manter em futuras mudanças de path.

---

## 10. Checklist de validação pós-implementação (futuro)

Quando for implementar reorganização:

- [ ] Todos os links da sidebar abrem rota existente.  
- [ ] Super admin não-super não acede (guard inalterado).  
- [ ] Fluxos críticos: criar tenant, alterar plano, gateway, legal publish, envio de anúncio, impersonar.  
- [ ] Nenhuma rota 404 nas URLs bookmarkadas pelos utilizadores internos.

---

*Documento gerado por auditoria ao código em `src/App.tsx`, `src/layouts/SuperAdminLayout.tsx`, `src/pages/superadmin/*`, `src/components/SuperAdminGuard.tsx` e `packages/backend/src/routes/superadminRoutes.ts`.*
