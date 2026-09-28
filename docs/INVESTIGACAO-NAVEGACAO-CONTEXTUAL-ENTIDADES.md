# Investigação e plano — Navegação contextual global (cliente / lead)

**Objetivo deste documento:** mapear o estado atual do PainelCRM e propor um plano **incremental e seguro** para que nomes de cliente e lead se tornem atalhos consistentes em todo o sistema.  
**Escopo:** investigação e arquitetura — **sem implementação de código** nesta etapa.

---

## 1. Rotas e superfícies atuais

### 1.1 Clientes

| Conceito | Detalhe |
|----------|---------|
| **Lista** | `/clients` — página `Clients.tsx`. |
| **Perfil completo** | `/clients/:id` e abas `/clients/:id/:tab` (ex.: `tasks`, `tickets`, `contracts`, …) — `ClientProfile.tsx`. |
| **Drawer / modal “pronto”** | `ClientDetailsDialog` (`src/components/clients/ClientDetailsDialog.tsx`): modal de detalhe pensado para o **funil** (recebe `Client` do tipo funnel + tags). Útil como referência de UX, mas **não** é o perfil CRM completo; hoje é usado em `FunnelDetails.tsx` entre outros. |
| **API resumo** | `GET /api/clients/:id` via `clientsService.getClientById` (usado em várias telas, ex. `CustomerInvoiceDetail.tsx`). Lista: `getClients()`. |

**Rota canónica para “abrir cliente” (fase 1 — só rota):**  
`/clients/{clientId}` (opcionalmente preservar query `?from=chat&…` usando helpers existentes em `src/utils/clientProfileNavigation.ts`, ex. `buildClientProfileToFromChat`, quando o contexto for chat).

### 1.2 Leads

| Conceito | Detalhe |
|----------|---------|
| **Lista / board único** | `/leads` — `Leads.tsx` (tabela, kanban de leads, mobile cards). **Não existe** no `App.tsx` rota do tipo `/leads/:id` para perfil dedicado. |
| **Drawer / modal atual** | `LeadDetailsDialog` (`src/components/leads/LeadDetailsDialog.tsx`): é a **superfície principal** de “perfil” do lead hoje (aberto por estado local na página de leads). |
| **API resumo** | `GET /api/leads/:id` (ver comentário em `Leads.tsx` alinhado ao carregamento para detalhe). |

**Rota canónica para “abrir lead” na fase 1:**  
- **Opção A (mínima):** `navigate('/leads')` + convenção futura `?leadId=` ou estado global (requer pequena extensão em `Leads.tsx` para abrir o dialog ao montar).  
- **Opção B (recomendada em fase 2):** introduzir rota **`/leads/:id`** (ou `/leads/:id/overview`) espelhando o padrão de clientes, e redirecionar o dialog para essa rota gradualmente.

**Componentes reaproveitáveis**

- `ClientDetailsDialog` — referência de modal cliente (funil); perfil CRM completo continua sendo a rota `/clients/:id`.  
- `LeadDetailsDialog` — base para futura extração de “quick view” ou drawer.  
- `ClientSearchCombobox` / `LeadSearchCombobox` — já existem para **seleção**, não para link de leitura em tabela.  
- `buildClientProfileToFromChat` / `getClientProfileReturnContext` — preservação de contexto ao sair do chat.

---

## 2. Permissões (frontend)

Fonte: `ModulePermissionsContext` (`src/contexts/ModulePermissionsContext.tsx`).

- **`canView('clients')`** — módulo `clients` no mapa retornado por `getMyPermissions()`. Tenant admin vê tudo.  
- **`canView('leads')`** — idem para `leads`.  
- **`hasPermissionKey(...)`** — chaves granulares do catálogo (`src/permissions/permissionCatalog.ts`); usar quando o módulo não bastar (ex.: dashboard).  
- **Feature flags** (`useFeatureFlag('leads')`, `useFeatureFlag('tickets')`, …) — plano/tenant pode esconder módulo inteiro; combinar com `canView` para não mostrar link “morto”.

**Regra proposta:** sem `canView('clients')` → não renderizar link para cliente (apenas texto); sem `canView('leads')` → idem para lead. O backend já deve bloquear `GET` não autorizado; a UI evita expectativa falsa.

---

## 3. Onde nomes aparecem — tabela resumida

Pesquisa orientadora: `client_id`, `client_name`, `lead_id`, `contact_name`, `clientMap`, etc., nas páginas principais.  
Legenda **EntityLink?**: “Sim” = há identificador estável + nome para virar link na fase 1/2; “Parcial” = precisa tratamento (outro campo ou só nome).

| Módulo | Arquivo(s) principal(is) | Campo exibido (típico) | `client_id` / `lead_id`? | Pode virar EntityLink? | Observação |
|--------|---------------------------|-------------------------|----------------------------|---------------------------|------------|
| Faturas (lista) | `CustomerInvoices.tsx` | Nome via `clientMap[client_id]` | `client_id` | Sim | Já distingue “Sem cliente”. |
| Fatura (detalhe) | `CustomerInvoiceDetail.tsx` | Nome resolvido (`client`) | `client_id` | Sim | Já chama `getClientById` — bom ponto para primeiro link estilizado. |
| Cobranças | `CustomerCharges.tsx` | `clientMap[ch.client_id]` | `client_id` | Sim | Mesmo padrão que faturas. |
| Assinaturas | `SubscriptionsList.tsx` | `row.client_name` | `client_id` (na row) | Sim | Confirmar tipo da row em `crmSubscriptions` service. |
| Tickets (lista) | `Tickets.tsx` | `contact_name` | `client_id` no modelo `Ticket` | Parcial | Lista mostra **contacto**, não nome do cadastro; link ao cliente só faz sentido se `client_id` preenchido. |
| Ticket (detalhe) | `TicketDetail.tsx` | — | `client_id` | Sim | **Já existe** `Link` para `/clients/{id}` (“Abrir cliente no CRM”) — padronizar com componente global depois. |
| Propostas | `Proposals.tsx` | `clientLabel` / nome | `client_id`, `lead_id` | Sim (dois tipos) | Lógica explícita cliente vs lead comercial. |
| Contratos | `Contracts.tsx` | `client_name` | `client_id` | Sim | Células truncadas com `title`. |
| Projetos | `Projects.tsx` | `clientName` / mensagens Drive | `client_id` | Sim | Vários fluxos de edição; link só leitura nas listas/cabeçalhos. |
| Tarefas | `Tasks.tsx` | “Cliente: {task.client}” | `clientId` / `client_id` no serviço unificado | Sim | `tasks.ts` normaliza `clientId`/`client_id`. |
| Agenda | `AgendaPage.tsx` (+ formulários) | Nome conforme vínculo | `client_id`, `lead_id` | Sim | Já modela `link: 'client' \| 'lead' \| 'none'` e query `?client_id=` / `?lead_id=`. |
| Dashboard | `Dashboard.tsx` | `client_name` em subtítulos | Depende do payload `overview` | Parcial | Verificar se itens de atalho trazem `client_id`/`lead_id`; muitas linhas são só texto concatenado. |
| Chat | `Chat.tsx`, componentes kanban | Nomes de conversa / lead | `linked_client_id`, lead, etc. | Sim (complexo) | Alto acoplamento; fase tardia + cuidado com `FloatingCompactProfile`. |
| Kanban (chat) | Rotas `/chat/kanbam`, `ChatKanbanPage` | Nomes em cards | Variável | Parcial | Alinhar com modelo de conversa ↔ cliente/lead. |
| Funil | `FunnelDetails.tsx` | Nome do card | Client no estágio | Sim | Já usa `ClientDetailsDialog`. |
| Perfil cliente | `ClientProfile.tsx` | — | — | N/A | Destino de navegação, não origem. |

**Arquivos adicionais a varrer na implementação:** `CustomerInvoiceNew.tsx`, `ProposalDetails.tsx`, `ContractDetails.tsx`, `ProjectAreaPage.tsx`, `TaskFormDialog.tsx`, notificações (`HeaderNotificationBell.tsx`), relatórios financeiros unificados, etc.

---

## 4. Proposta de componente global

### 4.1 Uma API vs duas

| Abordagem | Prós | Contras |
|-----------|------|--------|
| **`<EntityLink />`** único | Uma só API mental; `entityType` discrimina; menos duplicação de estilos. | JSX um pouco mais verboso; imports de tipo união. |
| **`<ClientEntityLink />` + `<LeadEntityLink />`** | Tipagem estrita por props; tree-shake óbvio. | Duas superfícies para manter (variantes, acessibilidade). |

**Recomendação:** implementar **`EntityLink`** internamente delegando para subcomponentes leves (`ClientEntityLink` / `LeadEntityLink` como implementação ou `forwardRef`), exportando **só** `EntityLink` + wrappers opcionais para DX.

### 4.2 Props sugeridas (rascunho)

```ts
type EntityLinkProps = {
  entityType: 'client' | 'lead';
  entityId?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  subtitle?: string | null;
  variant?: 'inline' | 'table' | 'card' | 'compact';
  /** Fase 1: apenas 'route'. Fase 5: 'drawer'. */
  openMode?: 'route' | 'drawer';
  /** Quando sem permissão ou sem id: mostrar este texto ou `name`. */
  disabledFallbackText?: string | null;
  className?: string;
  /** Preservar contexto (ex.: retorno ao chat). */
  navigationState?: unknown;
};
```

### 4.3 Regras de renderização

1. **Sem `entityId`** → `<span>` (ou fragmento) com `name` ou `disabledFallbackText` — nunca `<a>`/`<Link>`.  
2. **Sem permissão** (`!canView('clients'|'leads')`) → idem (texto plano).  
3. **Com id + permissão** → `Link` (React Router) ou `button`+`navigate` com estilo de link discreto.  
4. **Lead sem rota dedicada** (fase 1) → ou texto até existir `/leads/:id`, ou `Link` para `/leads` com query documentada (requer alteração mínima em `Leads.tsx`).  
5. **Tooltip:** “Abrir cliente no CRM” / “Abrir lead” (acessível + `title`).

### 4.4 UX (alinhado ao pedido)

- Corpo do link: cor `text-foreground` com **sublinhado só no hover** (`underline-offset-4`), `cursor-pointer`.  
- Variante `table`: truncagem + `title` com nome completo; não aumentar altura da linha.  
- Avatar: opcional, `size-5`/`6`, só quando URL estável (evitar flicker).

---

## 5. Proposta de hook `useEntityNavigation()`

```ts
// Assinatura conceitual
function useEntityNavigation() {
  return {
    getClientUrl: (clientId: string, opts?: { tab?: string }) => string;
    getLeadUrl: (leadId: string, opts?: { query?: Record<string, string> }) => string;
    openClient: (clientId: string, opts?: { replace?: boolean; state?: unknown }) => void;
    openLead: (leadId: string, opts?: { replace?: boolean }) => void;
  };
}
```

- **Fase 1:** `openClient` → `navigate(\`/clients/${id}\`)`; `openLead` → política acordada (ver §1.2).  
- **Fase 5:** `openMode: 'drawer'` abre `EntityQuickViewDrawer` (novo) sem desmontar a rota atual.  
- **Dependências:** `useNavigate`, `useModulePermissions`, opcionalmente `useFeatureFlag`.  
- **Ciclos:** hook e `EntityLink` não devem importar páginas pesadas — só `react-router-dom` + contextos já existentes.

---

## 6. Plano de implantação por fases

### Fase 1 — Fundação (baixo risco)

- Criar `getClientUrl` / `getLeadUrl` em `src/lib/entityNavigation.ts` (ou `hooks/useEntityNavigation.ts`).  
- Criar `EntityLink` + testes visuais manuais em Storybook opcional.  
- **Sem** drawer; **sem** mudança obrigatória de backend.  
- Documentar convenção de query para lead se escolher opção A em §1.2.

### Fase 2 — Alto impacto comercial / financeiro

- `CustomerInvoices`, `CustomerInvoiceDetail`, `CustomerCharges`, `SubscriptionsList`, `Proposals`, `Contracts`, `TicketDetail` (substituir link manual).  
- Validar truncagem em tabelas e mobile.

### Fase 3 — Operacional

- `Projects`, `Tasks`, `AgendaPage` (listas e detalhes onde há nome + id), `Dashboard` (onde houver id no payload — pode exigir pequeno enriquecimento da API de overview **opcional**, avaliar antes).

### Fase 4 — Atendimento

- `Chat.tsx`, kanban, `FloatingCompactProfile`, notificações que carregam nome de cliente.

### Fase 5 — Drawer global (opcional)

- `EntityQuickViewDrawer`: `GET` resumo + ações (“Abrir perfil completo”, “Ir para conversa”).  
- Maior investimento; risco de duplicar `ClientProfile` / `LeadDetailsDialog`.

---

## 7. Critérios técnicos (checklist)

- [ ] Incremental: módulo a módulo, PRs pequenos.  
- [ ] Tabelas: não alterar estrutura de dados; só envolver células.  
- [ ] Fase 1 sem API nova: só composição de rotas existentes.  
- [ ] Funcionar com **só nome** (sem id): fallback texto.  
- [ ] Não navegar sem id válido (UUID).  
- [ ] Respeitar `canView` + feature flags relevantes.  
- [ ] Evitar imports circulares: `EntityLink` em `src/components/entity/` ou `src/components/links/`.  
- [ ] A11y: foco visível, `aria-label` quando o texto visível for truncado.

---

## 8. Riscos e cuidados

| Risco | Mitigação |
|-------|-----------|
| Lead sem URL estável | Definir cedo `/leads/:id` ou `?open=`; evitar `state` volátil em refresh. |
| Ticket: `contact_name` ≠ cliente | Usar `EntityLink` só quando `client_id` presente; caso contrário texto. |
| Dashboard sem ids | Não forçar link; enriquecer API só se custo baixo e privacidade ok. |
| Chat / floating: re-renders | Memoizar `EntityLink`; não buscar cliente no hover sem debounce. |
| Permissões ainda a carregar (`loading`) | Mostrar texto neutro até `loading === false` para não “piscar” link. |

---

## 9. Recomendação — o que implementar primeiro

1. **`EntityLink` + `useEntityNavigation`** com **apenas cliente** e rota `/clients/:id` (menor ambiguidade).  
2. **Substituir** o link já existente em **`TicketDetail.tsx`** pelo componente (prova real + consistência visual).  
3. **Aplicar** em **`CustomerInvoices`** + **`CustomerCharges`** (padrão `clientMap` + `client_id` muito claro).  
4. Em seguida **Propostas** (cliente + lead no mesmo padrão).  
5. Só então **rota dedicada de lead** ou query em `/leads` para `openLead` ficar simétrico a `openClient`.

---

## 10. Resultado esperado após execução do plano

Uma camada única e perceptível: em qualquer módulo, **se existir id e permissão**, o nome comporta-se como atalho contextual para o perfil da entidade; caso contrário, comporta-se como texto estático. A evolução para **drawer** permanece opcional e isolada na fase 5, sem obrigar refatoração das fases 1–4.

---

*Documento gerado na investigação do repositório PainelCRM (rotas em `App.tsx`, permissões em `ModulePermissionsContext`, padrões em páginas listadas). Ajustar linhas da tabela conforme novos módulos forem identificados durante a implementação.*
