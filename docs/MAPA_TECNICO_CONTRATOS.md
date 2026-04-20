# Mapa técnico — Contratos (CRM)

Documento objetivo: **arquivo → responsabilidade → relação com o fluxo**.  
Escopo: módulo de contratos comerciais do painel (não confundir com “contrato de API” ou “contrato de mensagem” do chat).

---

## Backend (Node / Express)

| Caminho | Função principal | Responsabilidade | Fluxo |
|--------|------------------|------------------|--------|
| `packages/backend/src/index.ts` | Montagem da app | Registra `app.use('/api/contracts', …)` e `app.use('/api/contract-templates', …)` | Entrada HTTP |
| `packages/backend/src/routes/contractsRoutes.ts` | Router | CRUD de contratos + signers + events; middleware `tenantAuthCrm` | Autenticado / tenant CRM |
| `packages/backend/src/routes/contractTemplatesRoutes.ts` | Router | CRUD de `contract_templates`; `tenantAuthCrm` | Autenticado / tenant CRM |
| `packages/backend/src/controllers/contractsController.ts` | `getContracts`, `getContractById`, `createContract`, `updateContract`, `deleteContract` | Persistência de contratos; listagem **por tenant** (JOIN `users.tenant_id`); create/update/delete com `assertModulePermission('contracts', …)` | Criação / edição / listagem interna |
| `packages/backend/src/controllers/contractTemplatesController.ts` | `getContractTemplates`, `createContractTemplate`, `updateContractTemplate`, `deleteContractTemplate` | CRUD de modelos; escopo tenant via JOIN; **sem** `assertModulePermission` | Modelos reutilizáveis |
| `packages/backend/src/controllers/contractSignersController.ts` | Signers CRUD | Valida posse do contrato com `contracts WHERE id = ? AND user_id = ?` (**criador apenas**, não tenant) | Partes / ordem de assinatura |
| `packages/backend/src/controllers/contractEventsController.ts` | Events CRUD | Mesma regra de posse **criador vs userId** | Timeline / auditoria leve |
| `packages/backend/src/controllers/searchController.ts` | Busca global | Inclui contratos: rota `/contracts/:id` | Descoberta no painel |
| `packages/backend/src/controllers/dashboardController.ts` | KPIs | Contagens / séries envolvendo `contracts` | Dashboard |
| `packages/backend/src/controllers/messageTemplatesController.ts` | Templates de mensagem | `resource_type: 'contracts'` e ações (`created`, `sent_for_signature`, …); seeds com `{{contract_link}}` | Notificações **se** acionadas |
| `packages/backend/src/services/tenantUserRemovalService.ts` | Remoção de usuário | Reaponta / remove dados `user_id`; trata `contracts`, `contract_templates`, `responsible_id` | Operações de tenant |
| `packages/backend/src/services/modulePermissionsService.ts` | Módulos | Registro do módulo `contracts` | Permission engine |
| `packages/backend/src/utils/tenantSecurity.ts` | Lista de tabelas | Inclui `contracts`, `contract_templates` | Defesa em profundidade / RLS |

**Inexistências no backend (levantamento):** rotas públicas de assinatura/visualização, geração de token, webhook de assinatura, serviço de e-mail dedicado ao fluxo de contrato, geração de PDF server-side para contrato.

---

## Banco de dados (PostgreSQL)

| Artefato | Conteúdo relevante | Fluxo |
|---------|-------------------|--------|
| `database/init/07_create_contracts.sql` | `contracts`, `contract_templates`, `contract_signers`, `contract_events`; FK `contracts.template_id → contract_templates` | Schema base |
| `database/init/02_create_enums.sql` | Enum `contract_status` | Estados possíveis |
| `database/init/57_rls_tenant_isolation.sql` | RLS em `contracts`, `contract_templates`, `contract_signers`, `contract_events` (escopo via `user_id` do contrato / tenant) | Supabase / isolamento |
| `supabase/migrations/*` | Variante histórica do schema + RLS com `auth.uid()` | Legado / ambientes Supabase |

**Colunas-chave (contrato):** `content`, `content_html`, `template_id`, `variables` (JSONB), `signature_settings` (JSONB), `status`, vínculos `client_id`, `responsible_id`, `user_id` (criador).

**Colunas-chave (assinante):** `signed_at`, `signature_data` (JSONB) — **sem código que as preencha no fluxo atual**.

---

## Frontend (React / Vite)

| Caminho | Responsabilidade | Fluxo |
|---------|------------------|--------|
| `src/App.tsx` | Rotas `/contracts`, `/contracts/new`, `/contracts/:id`, `/contracts/:id/edit` | **Todas** atrás de `AuthGuard` |
| `src/pages/Contracts.tsx` | Listagem, filtros, ações em massa | Interno |
| `src/pages/NewContract.tsx` | Wizard: em branco / modelo; editor; assinantes; salvar rascunho; “Enviar para assinatura” (só muda status + evento) | Criação / envio “lógico” |
| `src/pages/ContractDetails.tsx` | Detalhes, timeline, tabela de signers; ações de menu (várias **sem handler**) | Consulta interna |
| `src/pages/ClientProfile.tsx` | Aba contratos; navegação para detalhe / novo | Por cliente |
| `src/pages/Chat.tsx` | Diálogo rápido “Criar contrato”; notificação `messagesService.send` com `contract_link` | Origem alternativa |
| `src/services/contracts.ts` | Cliente HTTP para `/api/contracts` e `/api/contract-templates` | Integração |
| `src/types/contracts.ts` | Tipos TS | Contrato |

---

## Integrações / dependências externas

| Sistema | Relação com contratos |
|---------|----------------------|
| **Perfex** | Não há referências no repositório |
| **WhatsApp / e-mail** | Apenas via **templates de mensagem** genéricos (`messageTemplatesController`) e `Chat.tsx` usando `messagesService.send` no evento `created`; não há pipeline específico de “link de assinatura” |
| **Área do cliente (faturas públicas)** | Padrão semelhante em outras áreas do projeto; **contratos não têm rota pública espelhada** |

---

## Diagrama textual (dependências)

```
[UI: Contracts / NewContract / ContractDetails / Chat]
        │ apiClient (JWT + tenant)
        ▼
[/api/contracts | /api/contract-templates]
        │
        ├── contractsController ──► contracts (tenant-scoped queries + permissions)
        ├── contractTemplatesController ──► contract_templates (tenant-scoped; sem module permission)
        ├── contractSignersController ──► contract_signers (ownership = contract.user_id only)
        └── contractEventsController ──► contract_events (idem)

PostgreSQL ◄── RLS (tenant) + FKs (client_id → clients, template_id → contract_templates)
```

---

## Pontos de entrada (usuário)

1. Menu **Contratos** → listagem → novo / detalhe / edição.  
2. **Perfil do cliente** → aba contratos.  
3. **Chat** → ação “Criar contrato” (fluxo simplificado).

## Pontos de saída (dados / efeitos)

1. Linhas em `contracts`, `contract_signers`, `contract_events`, opcionalmente `contract_templates`.  
2. Notificação opcional (chat) com link **interno** `/contracts/:id`.  
3. Não há saída para canal público de assinatura nem PDF gerado pelo servidor.
