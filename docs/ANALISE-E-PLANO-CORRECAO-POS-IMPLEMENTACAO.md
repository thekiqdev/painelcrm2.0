# Análise e plano de correção — Pós-implementação Customer Invoice

**Objetivo:** Diagnóstico da causa raiz de cada problema reportado e plano de correção seguro, **sem implementar** até aprovação.

---

## PROBLEMA 1 – Coluna `cpf_cnpj` não existe na tabela `clients`

### Sintoma
- **Erro:** `"column cpf_cnpj of relation clients does not exist"`
- **Contexto:** Ao editar cliente (PATCH /api/clients/:id com campo `cpf_cnpj`), o backend monta UPDATE incluindo a coluna e o PostgreSQL responde que a coluna não existe.

### Verificação feita
- **Migration:** O arquivo `database/init/72_clients_cpf_cnpj.sql` existe e contém:
  - `ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;`
- **Ordem de migração:** O arquivo `72_clients_cpf_cnpj.sql` está listado em `packages/backend/src/migrate.ts` na posição correta (após 71, antes de create-admin-user).
- **Código:** O controller de clientes usa `cpf_cnpj` no schema, no INSERT (create) e no UPDATE dinâmico (update). Nenhum typo; nome da coluna é `cpf_cnpj` em todo o código.

### Causa raiz
- A migration **72** foi criada e está no script de migração, mas **não foi executada** no banco de dados que a aplicação está usando.
- Possíveis motivos:
  1. **Migração nunca rodada:** Após adicionar a migration 72, ninguém executou `npm run migrate` (ou o comando equivalente) contra esse banco.
  2. **Banco diferente:** A app usa outro database (outro host, outra base, outro ambiente) que não recebeu as migrations até a 72.
  3. **Deploy:** Em produção/homologação, o passo de migração pode não estar no pipeline ou pode ter falhado sem rollback do código.

Não há evidência de nome de coluna divergente nem de migration removida; o problema é **estado do schema**: o banco em uso está atrás do código.

### Solução proposta (segura)

| Etapa | Ação | Onde | Por quê |
|-------|------|------|--------|
| 1.1 | **Confirmar qual banco a app usa** | `.env` (POSTGRES_HOST, POSTGRES_DB, etc.) | Garantir que migração e app apontam para o mesmo banco. |
| 1.2 | **Rodar as migrations pendentes** | Na raiz: `npm run migrate` (ou o comando que lê `database/init` e `migrate.ts`) | Executa 72 e qualquer outra pendente; cria a coluna `cpf_cnpj` com `ADD COLUMN IF NOT EXISTS`, idempotente. |
| 1.3 | **Validar schema após migração** | No PostgreSQL: `\d public.clients` ou `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='cpf_cnpj';` | Confirmar que a coluna existe. |
| 1.4 | **Não alterar código** | — | O backend está correto; não remover nem condicionar o uso de `cpf_cnpj` no código. |

**Risco:** Baixo. A migration 72 só adiciona coluna opcional (NULL); não quebra dados existentes.

**Se não puder rodar migrate no mesmo processo:** Garantir que o mesmo SQL da 72 seja aplicado no banco alvo (por ferramenta de deploy, DBA ou outro pipeline), na mesma ordem relativa às demais migrations.

---

## PROBLEMA 2 – Gateway Asaas: “Gateway não configurado” mesmo após configurar e testar

### Sintoma
- Gateway configurado (credenciais salvas).
- Teste de conexão executado com sucesso.
- No modal “Nova Fatura — Pré-requisitos”, o item do gateway continua com ❌ “Gateway não configurado”.

### Como o sistema decide “gateway configurado”
- **Pré-condições (checklist):** `validateInvoicePreconditions` chama `getActiveConfig('crm', tenantId)`.
- **getActiveConfig(billingType = 'crm', tenantId):**  
  - Query em `payment_gateway_configs`:  
    `scope = 'tenant' AND tenant_id = $1 AND is_active = true AND status = 'active'`.
  - Ou seja, para o CRM só considera config **ativa** e com **status = 'active'**.

### Quando `status` vira `'active'`
- **Ao salvar config (tenant):** `saveTenantConfig` grava/atualiza a linha com **`status = 'pending'`** (INSERT e UPDATE em `paymentGatewayConfigService.ts`).
- **Ao testar conexão:** `postMyTenantPaymentGatewayTest` chama `updateConnectionTestResult('tenant', tenantId, config.gateway_key, 'ok', 'active')`, que faz UPDATE na mesma linha setando **`status = 'active'`**.

Ou seja: no desenho atual, “configurado” para o checklist = config existente **e** teste de conexão bem-sucedido (`status = 'active'`).

### Possíveis causas da falha
1. **Coluna `status` inexistente em `payment_gateway_configs`**  
   - A coluna `status` (e as de teste) vêm da migration **61** (`61_payment_gateways_panel_phase1.sql`).  
   - Se a migration 61 não foi aplicada nesse banco, o UPDATE que seta `status = 'active'` pode falhar (ou ser ignorado) e o SELECT em `getActiveConfig` pode nem considerar `status`, dependendo de como falhe.  
   - **Consequência:** Config fica sempre “não configurada” para o checklist ou o teste não persiste o status.

2. **Teste não persiste o status**  
   - Ex.: erro após `testConnection()` mas antes de `updateConnectionTestResult`; ou exceção dentro de `updateConnectionTestResult`; ou transação não commitada.  
   - Menos provável se o frontend recebe `{ connected: true }`, mas vale checar logs no momento do teste.

3. **Tenant diferente entre “testar” e “pré-requisitos”**  
   - Se `req.tenantId` no GET de pré-condições for diferente do `tenantId` usado no POST do teste (ex.: token de outro usuário/tenant, ou bug no middleware que preenche `tenantId`), o checklist consulta outro tenant e não vê a config que acabou de ser testada.

4. **Cache ou conexão de leitura atrasada**  
   - `getActiveConfig` lê direto do pool (sem cache explícito no código). Se houver cache em outro lugar ou leitura em réplica com lag, pode ver estado antigo.

5. **Migrations 60 vs 61**  
   - Tabela criada na 60 sem `status`; 61 adiciona `status`, `last_connection_test_at`, `last_connection_status`.  
   - Se só a 60 foi aplicada, não existe coluna `status` e a query em `getActiveConfig` que filtra por `status = 'active'` pode falhar ou não retornar linhas (dependendo do driver/schema).

### Solução proposta (por ordem de prioridade)

| Etapa | Ação | Onde | Por quê |
|-------|------|------|--------|
| 2.1 | **Garantir migrations 60 e 61 aplicadas** | Banco usado pela app | Sem a 61, `status` não existe e a lógica de “ativo” não funciona. Verificar com `\d payment_gateway_configs` ou `information_schema.columns`. |
| 2.2 | **Confirmar que o teste persiste** | Logs no POST `/api/me/tenant/payment-gateway/test` | Ver se após 200 e `connected: true` o UPDATE em `updateConnectionTestResult` é executado e não lança erro. Opcional: após o teste, consultar no banco a linha do tenant e ver se `status = 'active'`. |
| 2.3 | **Confirmar mesmo tenant** | Middleware de auth e rotas de pré-condições vs teste | Garantir que GET pré-condições e POST teste usam o mesmo `req.tenantId` para o mesmo usuário. |
| 2.4 | **Ajuste de critério (opcional)** | `customerInvoicePreconditions.ts` e/ou `paymentGatewayConfigService.ts` | Se, após 2.1–2.3, o problema continuar ou for desejável não exigir “teste” para o checklist: usar um critério mais fraco só para **exibir** “configurado” (ex.: existir config tenant com `is_active = true` e credencial preenchida), mantendo `getActiveConfig` com `status = 'active'` para **criar cobrança**. Documentado como Opção B na Fase 4. |
| 2.5 | **Auto-validar ao salvar (opcional)** | `saveTenantConfig` ou controller PUT do tenant gateway | Após salvar, chamar o teste de conexão em background e, se sucesso, setar `status = 'active'` (evita passo manual “Testar conexão”). |

**Ordem recomendada:** Fazer 2.1 e 2.2 primeiro (schema + persistência). Se ainda falhar, 2.3 (tenant). Só então 2.4/2.5 se quiser mudar comportamento ou UX.

---

## PROBLEMA 3 – Aviso de segurança multi-tenant (client_tasks)

### Sintoma
- **Aviso:** `[tenantSecurity] SELECT em tabela(s) tenant-scoped sem filtro de tenant detectado`
- **Query:** `SELECT * FROM client_tasks WHERE client_id = $1`

### Onde ocorre
- **Arquivo:** `packages/backend/src/controllers/clientsController.ts`
- **Função:** `getClientTasks` (GET de tarefas do cliente).
- **Trecho:** Após `clientBelongsToTenant(id, req.tenantId)`, a query executada é:
  - `SELECT * FROM client_tasks WHERE client_id = $1 ORDER BY created_at DESC`
  - Sem nenhum JOIN ou condição que inclua `tenant_id` ou padrão aceito por `assertTenantScopedQuery`.

### Por que o aviso existe
- **tenantSecurity.ts:** Em desenvolvimento, todo SELECT que toca tabela listada em `TENANT_SCOPED_TABLES` (inclui `client_tasks`) deve conter um “filtro de tenant” (padrões como `tenant_id`, `user_id IN (SELECT ... users ... tenant_id)`, `JOIN users ... tenant_id`).
- A query atual não contém nenhum desses padrões; portanto o aviso é emitido.

### Risco real
- **Contenção:** Antes da query, o código chama `clientBelongsToTenant(id, req.tenantId)`. Se o cliente não for do tenant, responde 404 e **não** executa o SELECT. Ou seja, não há vazamento de dados entre tenants pelo fluxo atual.
- **Problema:** O utilitário de segurança não enxerga essa garantia (que está em outra linha); ele só analisa o texto da query. Para deixar o código alinhado ao padrão do projeto e eliminar o aviso (e evitar regressões futuras), a query deve **incluir** o filtro por tenant.

### Solução proposta

| Etapa | Ação | Onde | Por quê |
|-------|------|------|--------|
| 3.1 | **Incluir filtro por tenant na query de client_tasks** | `clientsController.ts`, função `getClientTasks` | Fazer JOIN com `clients` e `users` e filtrar por `u.tenant_id = $2`, passando `[id, req.tenantId]`. Assim a própria query garante isolamento e satisfaz `assertTenantScopedQuery`. |
| 3.2 | **Manter a checagem prévia** | `clientBelongsToTenant(id, req.tenantId)` antes da query | Continua retornando 404 se o cliente não for do tenant; a query então só roda para client_id já validado e com tenant no JOIN. |

**Forma da query sugerida (conceito):**
- Trocar `SELECT * FROM client_tasks WHERE client_id = $1 ORDER BY ...` por algo como:
  - `SELECT ct.* FROM client_tasks ct INNER JOIN clients c ON c.id = ct.client_id INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2 WHERE ct.client_id = $1 ORDER BY ct.created_at DESC`
- Parâmetros: `[id, req.tenantId]` (ou `[req.tenantId, id]` conforme a ordem dos placeholders).

**Risco:** Nenhum, desde que se use o mesmo `client_id` e `tenantId` do request e se mantenha a checagem de pertencimento.

---

## Resumo e ordem segura de implementação

### Diagnóstico resumido
| # | Problema | Causa raiz | Código vs banco |
|---|----------|------------|------------------|
| 1 | Coluna `cpf_cnpj` não existe | Migration 72 não aplicada no banco em uso | Código certo; schema do banco atrasado |
| 2 | Gateway “não configurado” após teste | Provável falta da migration 61 (`status`) e/ou tenant/ persistência do teste | Schema ou fluxo de atualização de `status` |
| 3 | Aviso tenant em `client_tasks` | SELECT em tabela tenant-scoped sem padrão de filtro por tenant na query | Código: query sem JOIN/tenant_id |

### Ordem sugerida para correção (sem implementar ainda)

1. **Problema 1 (cpf_cnpj)**  
   - Confirmar banco da aplicação.  
   - Executar migrations pendentes (incluindo 72).  
   - Validar coluna `cpf_cnpj` em `public.clients`.  
   - Não mudar código do controller.

2. **Problema 2 (gateway)**  
   - Garantir migrations 60 e 61 no mesmo banco.  
   - Reproduzir: configurar gateway, testar conexão, depois abrir pré-requisitos; checar no banco se a linha do tenant tem `status = 'active'`.  
   - Se estiver tudo aplicado e o status não mudar, investigar tenant e persistência (2.2–2.3).  
   - Opcional depois: relaxar critério no checklist (2.4) ou auto-testar ao salvar (2.5).

3. **Problema 3 (tenant security)**  
   - Alterar apenas a query de `getClientTasks`: adicionar JOIN com `clients` e `users` e filtro por `tenant_id`, mantendo `clientBelongsToTenant` antes.  
   - Rodar fluxo de listagem de tarefas do cliente e conferir que o aviso some em desenvolvimento.

### Objetivo final
- **CPF/CNPJ:** Funcionando via migration aplicada, sem alterar lógica do backend.  
- **Gateway:** Considerado configurado quando apropriado (schema 61 aplicado + status persistido; ou critério alternativo apenas para o checklist, se escolhido).  
- **Tenant:** Sem avisos de segurança em `client_tasks` e query explícita por tenant.

---

**Documento apenas para análise e plano. Nenhuma alteração de código ou de banco foi aplicada.**
