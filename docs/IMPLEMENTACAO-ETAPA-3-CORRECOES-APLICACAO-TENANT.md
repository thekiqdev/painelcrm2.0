# Implementação — Etapa 3 Correções de aplicação (tenant)

## 1. Objetivo

Endurecer a **camada de aplicação** (controllers e services) para que o isolamento multi-tenant seja **consistente e explícito**, sem depender apenas de RLS no banco e **sem usar `user_id` como proxy de tenant** em fluxos colaborativos (chat, CRM). Manter mudanças **incrementais**, sem alterar schema, migrations ou RLS (Etapa 2).

## 2. Problemas encontrados

| Área | Problema |
|------|----------|
| `getClientMessages` | Cliente e conversas filtrados por **dono** (`clients.user_id`, `chat_conversations.user_id`), impedindo colegas do mesmo tenant de ver mensagens do cliente. |
| `createClient` / `updateClient` | `group_id` e `profile_id` validados só por formato UUID; **não** havia garantia de que grupo/perfil pertencessem ao tenant do request. |
| `migrateConversationLeadToClient` | Atualizava conversa assumindo `clientId` confiável; risco teórico de **link cruzado** se o chamador passasse ID de outro tenant. |
| `getCustomerInvoiceItems` | Consulta só por `invoice_id`; itens não têm `tenant_id` na tabela — defesa dependia de RLS e de o chamador nunca errar o par invoice/tenant. |
| `tenantSecurity` | Mensagem de alerta podia reforçar o padrão **fatura → tenant → itens**. |

Revisão pontual: **`conversationMatchingService`** já recebe `tenantId` e filtra `clients`/`leads` via `users.tenant_id` — sem alteração necessária nesta etapa.

## 3. Padrão correto de isolamento

- **Leitura colaborativa (CRM, chat por cliente, listas):** escopo por **`req.tenantId`** (ou equivalente), com `JOIN users ... tenant_id` quando a entidade é dono via `user_id`.
- **`user_id`:** ownership (permissões, auditoria, “quem criou”), **não** fronteira de tenant em endpoints compartilhados.
- **Endpoints só do usuário** (ex.: perfil próprio): continua válido filtrar por `user_id` onde já é o contrato do produto.
- **Referências cruzadas (`group_id`, `profile_id`, `clientId` em migrações):** validar **existência + tenant** antes de persistir.

## 4. Correções realizadas (por arquivo)

| Arquivo | Alteração |
|---------|-----------|
| `packages/backend/src/controllers/chatController.ts` | `getClientMessages`: exige `req.tenantId`; cliente via `clients` + `users.tenant_id`; conversas via `chat_conversations` + `users.tenant_id` (qualquer usuário do tenant). |
| `packages/backend/src/controllers/clientsController.ts` | Funções `clientGroupBelongsToTenant` e `userProfileBelongsToTenant`; `createClient` e `updateClient` validam grupo/perfil contra o tenant antes de INSERT/UPDATE. |
| `packages/backend/src/services/conversationLinkService.ts` | `migrateConversationLeadToClient`: resolve `tenant_id` do dono da conversa; exige que `clientId` exista com `clients.user_id` no mesmo tenant; só então faz `UPDATE`. |
| `packages/backend/src/services/customerInvoiceService.ts` | `getCustomerInvoiceItems(invoiceId, tenantId)`: pré-cheque em `customer_invoices`; comentário JSDoc documentando o motivo. |
| `packages/backend/src/controllers/customerInvoicesController.ts` | `getCustomerInvoiceById` passa `tenantId` para `getCustomerInvoiceItems`. |
| `packages/backend/src/services/recurringBillingJobService.ts` | Recorrência: passa `prevInvoice.tenant_id` ao buscar itens da fatura anterior. |
| `packages/backend/src/utils/tenantSecurity.ts` | Texto do warning ampliado (faturas/itens). |

## 5. Validações adicionadas

- **Grupo:** `client_groups.id` + `client_groups.user_id` → `users.tenant_id = req.tenantId`.
- **Perfil:** `user_profiles.id` + `user_profiles.owner_id` → `users.tenant_id = req.tenantId`.
- **Migração lead→cliente:** `clientId` com `clients` + `users.tenant_id` igual ao do dono da conversa (`params.userId`).
- **Itens de fatura:** existência de linha em `customer_invoices` com `(id, tenant_id)` antes do `SELECT` em `customer_invoice_items`.

Códigos de erro HTTP (clientes):

- `400` + `INVALID_GROUP_FOR_TENANT` / `INVALID_PROFILE_FOR_TENANT` (e mensagens descritivas).
- `403` + `INVALID_TENANT` quando há `group_id` ou `profile_id` preenchido mas o request não tem tenant resolvido.

## 6. Impacto em rotas existentes

- **GET** `/api/chat/clients/:id/messages` (ou rota equivalente registrada): passa a exigir tenant; usuários do **mesmo tenant** veem mensagens agregadas de **todas** as conversas daquele cliente no tenant (comportamento alinhado a `getClients` / escopo por tenant).
- **POST/PATCH** clientes: criação/edição com `group_id`/`profile_id` de outro tenant passa a falhar com **400** em vez de possível inconsistência silenciosa ou erro de FK genérico.
- **GET** `/api/customer-invoices/:id`: fluxo inalterado para o cliente; internamente a lista de itens é amarrada ao `tenantId` do JWT/sessão.
- **Worker de recorrência:** mesmo contrato de dados; chamada passa `tenant_id` da fatura anterior (já presente na linha de `customer_invoices`).

## 7. Como validar manualmente

1. **Dois usuários, mesmo tenant:** ambos abrem o mesmo cliente e o chat por cliente; mensagens carregam para os dois; listagem de clientes continua coerente.
2. **Dois tenants:** usuário A não acessa cliente/fatura/mensagens do tenant B (incluindo IDs adivinhados na URL).
3. **Conversão lead → cliente:** fluxo normal; em ambiente de teste, se fosse possível forçar `clientId` estranho, a migração não aplicaria vínculo (erro logado no `updateLead` existente).
4. **Criação/edição de cliente:** `group_id` de outro tenant → 400 `INVALID_GROUP_FOR_TENANT`; idem perfil com `INVALID_PROFILE_FOR_TENANT`.
5. **Chat:** `getClientMessages` com tenant válido e cliente do tenant → 200; sem tenant → 403.
6. **Faturas:** detalhe da fatura retorna itens como antes; ID de fatura de outro tenant continua 404 no `getInvoiceById`, e itens retornam vazio se o par invoice/tenant for inválido.

## 8. Riscos e limitações

- **Mudança de comportamento intencional:** colaboradores do tenant passam a ver **todas** as conversas do cliente no tenant em `getClientMessages` (antes só as do usuário logado). Produtos que dependiam do isolamento por usuário nesse endpoint precisam ser reavaliados — o alinhamento com o restante do CRM é por **tenant**.
- **`user_profiles`:** validação usa **owner** no tenant; perfis compartilhados com modelo mais fino podem exigir regra adicional em etapa futura.
- **`migrateConversationLeadToClient`:** em falha de validação lança `Error`; chamadores existentes (ex.: `updateLead`) já envolvem em `try/catch` e apenas logam — conversa pode não migrar sem derrubar a resposta 200 do update do lead.
- **RLS** continua sendo a segunda linha de defesa; esta etapa não a substitui.
- **Não** foi adicionado `tenant_id` em `clients`/`leads`; joins via `users` permanecem o padrão.
