# Investigação estruturada — Propostas / Orçamentos (PainelCRM)

**Escopo:** estado atual do código e do banco, benchmark funcional, gaps, riscos e direção de evolução.  
**Não inclui implementação** — apenas diagnóstico e recomendações alinhadas a baixo risco e compatibilidade com produção.

---

## 1. Resumo executivo

O PainelCRM possui **infraestrutura mínima mas real** de propostas: tabela `proposals`, API REST CRUD (`/api/proposals`), permissões por módulo (`proposals`: view/create/edit/delete com regras *own* para *member*), integração pontual no **Chat** (criação via `proposalsService.createProposal`) e uma tela de **detalhe** que consome a API (`ProposalDetails`). Porém:

- A listagem principal **`/proposals`** (`Proposals.tsx`) está **desconectada da API** e usa **dados mockados**.
- O **funil visual** (`useFunnelData`, `FunnelTabs`) usa **deals de exemplo** fixos no front — **não lista propostas reais** do backend.
- O **dashboard** expõe KPI “propostas”, mas o backend **conta registros da tabela `contracts`**, não `proposals` (inconsistência de produto/métrica).
- **Não existe** vínculo formal proposta ↔ fatura (`customer_invoices`), nem fluxo público de aceite, nem timeline/auditoria dedicada.
- Os **templates de mensagem** já preveem eventos futuros como `converted_to_invoice` e `converted_to_contract`, o que facilita evolução incremental.

**Conclusão:** o módulo está em estágio **MVP técnico + UX placeholder**. A evolução para um fluxo competitivo (envio, aceite, rastreio, conversão em fatura) deve ser **incremental**: primeiro alinhar dados e permissões, depois vínculo com faturamento existente (`customer_invoices` + itens), por fim automações e experiência pública.

---

## 2. Arquitetura atual encontrada

### 2.1 Banco de dados

| Artefato | Conteúdo |
|----------|-----------|
| `database/init/12_create_proposals.sql` | Tabela `proposals`: `id` (UUID), `user_id` (FK `users`, dono), `client_id`, `funnel_id`, `stage_id`, `title`, `description`, `amount`, `status` (`draft` \| `sent` \| `accepted` \| `rejected` \| `expired`), `sent_date`, `valid_until`, `items` (JSONB linhas com `description`, `quantity`, `unitPrice`, `total`), timestamps. |
| `database/init/57_rls_tenant_isolation.sql` | RLS habilitado em `proposals` com política por tenant (via join com `users`). |

**Observação:** itens são JSONB livre; não há normalização em tabela filha; não há `tenant_id` direto na linha (isolamento via `user_id` → tenant).

### 2.2 Backend

| Caminho | Responsabilidade |
|---------|------------------|
| `packages/backend/src/routes/proposalsRoutes.ts` | Registra rotas sob `/api/proposals` com `tenantAuthCrm`. |
| `packages/backend/src/controllers/proposalsController.ts` | `GET` lista (filtros `status`, `client_id`, `funnel_id`, `stage_id`), `GET :id`, `POST`, `PATCH`, `DELETE`. Validação Zod. `create` exige `assertModulePermission(..., 'proposals', 'create')`. `update`/`delete` exigem `edit`/`delete` com `ownerId` = `proposals.user_id`. |
| `packages/backend/src/index.ts` | `app.use('/api/proposals', proposalsRoutes)`. |
| `packages/backend/src/services/modulePermissionsService.ts` | Módulo `proposals` registrado; labels; defaults *own* para edição/exclusão em certos perfis. |
| `packages/backend/src/permissions/permissionTypes.ts` | `ModuleId` inclui `'proposals'`; ações atuais do engine: `create` \| `edit` \| `delete` \| `view`. |
| `packages/backend/src/controllers/dashboardController.ts` | KPI nomeado `proposals` calculado a partir de **`contracts`**, não da tabela `proposals`. |
| `packages/backend/src/controllers/messageTemplatesController.ts` | `resource_type` inclui `proposals`; eventos sugeridos incluem `converted_to_invoice`, `converted_to_contract`, etc. |

**Fluxo atual resumido:** usuário autenticado cria/atualiza proposta; listagem filtra por tenant via join em `users`; exclusão é hard delete; aceite/recusa no front são apenas `PATCH` de `status` sem validação de transição nem registro de auditoria.

### 2.3 Frontend

| Caminho | Responsabilidade |
|---------|------------------|
| `src/services/proposals.ts` | Cliente HTTP para `/api/proposals`. |
| `src/pages/ProposalDetails.tsx` | Carrega proposta por ID, exibe itens, permite aceitar/recusar (`updateProposal`). Rota: `/funnel/:funnelId/stage/:stageId/proposal/:proposalId`. |
| `src/pages/Proposals.tsx` | **UI mock**: cards estáticos, formulário de “nova proposta” não chama API. |
| `src/App.tsx` | Rotas `/proposals` e aninhada do detalhe no funil. **Não há** rota dedicada `/proposals/:id` para detalhe. |
| `src/hooks/useFunnelData.ts` | Funis reais via API; **deals** para o board vêm de **`initialDeals` hardcoded** — não integra `proposalsService`. |
| `src/components/funnel/FunnelTabs.tsx` | Aba “Propostas” reutiliza o mesmo `FunnelsList` com deals mock. |
| `src/layouts/AppLayout.tsx` | Menu “Propostas” condicionado à feature flag `proposals`. |
| `src/components/RequireModuleView.tsx` | Path `/proposals` mapeia módulo `proposals`. |
| `src/pages/Chat.tsx` | Diálogo cria proposta via API e notificação com `proposal_link: .../proposals/${id}` — **URL pode não bater** com rota real de detalhe (ver gaps). |

### 2.4 Faturamento (contexto para conversão)

| Artefato | Relevância |
|----------|------------|
| `database/init/70_customer_invoices.sql` + `71_customer_invoices_manual_support.sql` | Faturas de clientes com `origin` (`manual`, `subscription`, `api`, `import`), `invoice_type`, itens em `customer_invoice_items` (`76_customer_invoice_items.sql`). |
| `packages/backend/src/controllers/customerInvoicesController.ts` + `customerBillingService.ts` | Criação manual com `client_id`, `due_date`, `items` (quantidade, `unit_price_cents`, `discount_cents`, `product_id` opcional), integração gateway CRM. |

**Gap central:** não há coluna ou convenção documentada ligando `customer_invoices` a `proposals.id`.

---

## 3. Benchmark funcional (referências de mercado)

| Capacidade | HubSpot Quotes / CPQ | PandaDoc / Proposify / Qwilr | Zoho Books / Odoo (aceite → fatura) | Situação PainelCRM |
|------------|----------------------|------------------------------|--------------------------------------|---------------------|
| Templates reutilizáveis | Forte (produtos, bundles) | Forte (biblioteca, blocos) | Médio | **Ausente** (só texto + itens JSON) |
| Pricing table / opcionais | CPQ avançado | Linhas opcionais, upsell | Linhas de pedido / ordem | **Parcial** (linhas fixas no JSON; sem opcionais formais) |
| Aprovação interna pré-envio | Workflows | Aprovações / comentários | Regras internas | **Ausente** |
| Link público + tracking | Tracking de view | Analytics de abertura | Depende do módulo | **Ausente** |
| Aceite simples / assinatura | Assinatura / pagamento | E-sign nativo | Confirmação de orçamento | **Só** `status` via PATCH interno |
| Versionamento / duplicação | Versões de quote | Duplicar documento | Revisões de orçamento | **Ausente** |
| Conversão em fatura | Integração financeira | Alguns com ERP | Nativo | **Ausente** (fatura manual existe; sem origem proposta) |

**Elementos recomendados a incorporar (por prioridade e ROI):**

1. **Alinhar produto:** listagem e funil com dados reais; corrigir KPI dashboard.
2. **Vínculo proposta ↔ fatura** + botão “Gerar fatura” (manual primeiro).
3. **Estados e transições** explícitas (mesmo que iniciais sejam um subconjunto dos status “ideais”).
4. **Link público read-only** + registro de `viewed_at` (opcional token).
5. **Templates** (reutilizar modelo de contratos: snapshot HTML ou estrutura similar — decisão futura).
6. **Aprovação interna e e-sign** — fases posteriores.

---

## 4. Fluxo de status recomendado (adaptado ao existente)

**Hoje no banco:** `draft`, `sent`, `accepted`, `rejected`, `expired`.

**Evolução sugerida (incremental):**

| Fase | Status novos (opcional) | Notas |
|------|-------------------------|--------|
| Curto prazo | Manter os 5 atuais; adicionar **`invoiced`** ou flag `converted_invoice_id` | Evita migração pesada de CHECK se usar coluna de vínculo + status derivado na UI. |
| Médio prazo | `pending_internal_approval`, `approved_internal` | Exige permissão `approve` (ver seção 6). |
| Médio prazo | `viewed` (ou `sent` + `first_viewed_at`) | Compatível com tracking sem quebrar enum. |

**Mapeamento sugerido para “fluxo ideal” do pedido:**

- `draft` → rascunho interno.  
- `pending_internal_approval` / `approved_internal` → *futuro*.  
- `sent` → enviado ao cliente (data `sent_date`).  
- `viewed` → *futuro* ou derivado de timestamp.  
- `accepted` / `rejected` / `expired` → já existentes.  
- `invoiced` → *futuro* ou inferido por `customer_invoices.proposal_id` NOT NULL.

---

## 5. Conversão proposta aceita → fatura

### 5.1 Objetivo de produto

- Botão **“Gerar fatura”** visível quando proposta está **`accepted`**, com `client_id` preenchido (e demais pré-condições do billing).  
- **Vínculo forte:** `customer_invoices` referencia `proposals.id` (ou `origin = 'proposal'` + `source_proposal_id` — ver plano técnico).  
- **Cópia de dados:** mapear `items[]` → `customer_invoice_items` (`description`, `quantity`, `unit_price_cents`, `discount_cents`); total alinhado a `amount` (validar arredondamento centavos).  
- **Timeline:** registrar evento (tabela dedicada ou reuso de sistema de atividades, se existir para entidades CRM).  
- **Idempotência:** impedir dupla conversão acidental (unique parcial ou status `invoiced`).

### 5.2 Estratégias de automação (futuro)

| Modo | Descrição | Risco |
|------|-----------|--------|
| A — Manual apenas | Só via botão após aceite | Baixo |
| B — Rascunho automático | Ao aceitar, cria fatura `pending` sem charge até revisão | Médio |
| C — Cobrança automática | Ao aceitar, dispara gateway como hoje em fatura manual | Alto (CPF, gateway, duplicidade) |

**Recomendação inicial:** **Modo A**; depois **B** opcional por tenant/config.

---

## 6. UX/UI recomendada (inspirada em referências)

- **Header:** título, cliente, valor total, badge de status, datas (envio / validade).  
- **Abas sugeridas:** Resumo | Itens e preços | Atividade/Timeline | Documento (futuro) | Faturas vinculadas.  
- **Área de itens:** tabela tipo pricing (descrição, qtd, unitário, desconto, total) alinhada ao modelo de `customer_invoice_items`.  
- **Aceite:** em ambiente interno, ações com confirmação; em ambiente público, CTA único + registro de IP/user-agent (futuro).  
- **Ações rápidas:** Duplicar, Enviar (futuro), Gerar fatura, Ver cliente, Abrir funil.  
- **Listagem:** filtros por status, cliente, período; cards ou tabela densa — **sempre dados reais**.

---

## 7. Permissões — estado e extensão desejada

**Hoje:** apenas `view`, `create`, `edit`, `delete` no modelo genérico; propostas usam *own* para edit/delete em perfis operacionais.

**Extensões desejadas (fases):**

| Ação | Uso |
|------|-----|
| `send` | Marcar como enviada, gerar link público |
| `approve` | Aprovação interna |
| `accept_override` | Marcar aceite em nome do cliente (auditoria obrigatória) |
| `convert_to_invoice` | Botão gerar fatura / API de conversão |

*Implementação:* estender `PermissionAction` / armazenamento em `role_module_permissions` **ou** regras compostas (ex.: `convert_to_invoice` exige `billing.create`). Decisão no plano de execução para não duplicar conceitos.

---

## 8. Gaps consolidados

1. Listagem `/proposals` não integrada; experiência enganosa em produção.  
2. Funil de propostas não usa API; deals fictícios.  
3. Dashboard: métrica “propostas” incorreta (usa `contracts`).  
4. Sem rota pública, sem tracking de visualização.  
5. Aceite/recusa sem máquina de estados, sem auditoria.  
6. Chat gera link `/proposals/:id` sem rota de detalhe equivalente.  
7. Sem integração com `customer_invoices` / itens / impostos.  
8. Permissões finas (`send`, `convert_to_invoice`) inexistentes.  
9. Templates, versionamento, opcionais, CPQ — ausentes.

---

## 9. Riscos

| Risco | Mitigação |
|-------|-----------|
| Migração de CHECK `status` em `proposals` | Preferir novos campos (`viewed_at`, `invoice_id`) antes de alterar enum. |
| Dupla fatura para mesma proposta | Constraint ou flag `converted_at` + validação no serviço. |
| Arredondamento centavos (JSON `unitPrice` vs cents) | Função única de normalização na conversão. |
| RLS + backend | Manter padrão atual (queries via `user_id` / tenant). |
| Expectativa de e-sign | Comunicar roadmap; não prometer paridade PandaDoc na fase 1. |

---

## 10. Proposta de evolução (visão)

1. **Fundação de dados:** conectar UI ao backend; corrigir KPI; alinhar rotas/links.  
2. **Modelo de vínculo:** `proposal_id` em fatura ou tabela de junção; eventos de timeline.  
3. **Ação “Gerar fatura”:** endpoint dedicado reutilizando `createManualInvoice` com metadados de origem.  
4. **Fluxo público e tracking** (token, `asaas`-like patterns opcionais).  
5. **Templates e CPQ leve** (reuso de padrões do módulo de contratos onde fizer sentido).  
6. **Automação configurável** pós-aceite.

Detalhamento de etapas, arquivos e critérios de aceite: **`docs/PLANO_MODULO_PROPOSTAS_ORCAMENTOS.md`**.  
Inventário de arquivos: **`docs/MAPA_TECNICO_PROPOSTAS_ORCAMENTOS.md`**.
