# Auditoria: isolamento multi-tenant (dados de negócio)

**Contexto:** continuação de incidente crítico — não se assume que o isolamento está correto.  
**Escopo:** clients, leads, chat (conversas/mensagens/webhook/sync), faturas/cobranças, timeline, tabelas relacionadas.  
**Data da revisão de código/SQL:** 2026-03-31 (repositório `painelcrm`).

---

## 1. Estado atual real

### 1.1 Modelo de dados: coluna `tenant_id` vs `user_id`

| Tabela | `tenant_id` na linha? | NOT NULL? | Isolamento declarado no banco |
|--------|------------------------|-----------|-------------------------------|
| `clients` | **Não** — só `user_id` | — | RLS: `user_id ∈ users` do tenant da sessão (`57_rls_tenant_isolation.sql`) |
| `leads` | **Não** | — | Idem |
| `client_groups`, `client_tasks`, … | **Não** | — | Idem (via `user_id`) |
| `chat_instances` | **Não** — só `user_id` | — | RLS idem |
| `chat_conversations` | **Não** — só `user_id` (+ FK `instance_id`) | — | RLS idem |
| `chat_messages` | **Não** | — | RLS via conversa → `user_id` no tenant |
| `customer_invoices` | **Sim** | Sim (criação inicial) | RLS por `tenant_id` (`71_customer_invoices_manual_support.sql`) |
| `customer_charges` | **Sim** | Sim | RLS por `tenant_id` (`79_customer_charges.sql`) |
| `client_timeline_events` | **Sim** | Sim | **Sem RLS** nas migrations analisadas (`86_client_timeline_events.sql`) |
| `subscriptions` | **Sim** | Sim | **Sem RLS** nas migrations analisadas (`67_subscriptions.sql`) |
| `customer_invoice_items` | **Não** (só `invoice_id`) | — | **Sem RLS** (`76_customer_invoice_items.sql`) |
| `payment_customers` | **Sim** | Sim | **Sem RLS** (`61_payment_gateways_panel_phase1.sql` + alterações) |
| `billing_recurring_jobs` | **Sim** | Sim | **Sem RLS** (`69_billing_recurring_jobs.sql`) |

**Conclusão objetiva:** o isolamento “real” no CRM **não** é “toda linha tem `tenant_id`”. Para a maior parte do CRM histórico, o tenant é **derivado** de `users.tenant_id` através de `user_id` na linha. Isso **atende** isolamento **se** `user_id` for sempre de um usuário do tenant correto e **se** RLS + app estiverem sempre ativos.

---

## 2. Camada de aplicação: `setRequestDb` e pool

O `pool` usado pelos controllers delega ao client da request quando há contexto (`setRequestDb`), aplicando `SET LOCAL app.current_tenant_id` e `app.bypass_rls` para superadmin.

```38:56:c:\CURSOR\painelcrm\packages\backend\src\utils\db.ts
export const pool = {
  query(
    textOrConfig: string | pg.QueryConfig,
    values?: unknown[]
  ): Promise<pg.QueryResult> {
    const text = getQueryText(textOrConfig);
    assertTenantScopedQuery(text);

    const store = dbRequestStorage.getStore();
    if (store?.client) {
      if (typeof textOrConfig === 'string') {
        return store.client.query(textOrConfig, values);
      }
      return store.client.query(textOrConfig);
    }
    if (typeof textOrConfig === 'string') {
      return internalPool.query(textOrConfig, values);
    }
    return internalPool.query(textOrConfig);
  },
```

`tenantAuth` inclui `setRequestDb`:

```290:290:c:\CURSOR\painelcrm\packages\backend\src\middleware\auth.ts
export const tenantAuth = [authenticateToken, setCurrentTenant, requireActivePlanPeriod, setRequestDb];
```

**Risco:** qualquer rota **autenticada** que use `pool` **sem** passar por `setRequestDb` cai no `internalPool` com **sessão sem** `app.current_tenant_id`. Para tabelas com RLS baseada no tenant, isso tende a **não expor** linhas de outros tenants (predicado falso), mas **pode** causar comportamento inconsistente ou, em políticas mal formuladas, surpresas. Para tabelas **sem** RLS, o `internalPool` vê **toda a tabela**.

---

## 3. Queries reais — pontos verificados

### 3.1 Clients / listagem (usa `tenant_id` via join em `users`)

```82:105:c:\CURSOR\painelcrm\packages\backend\src\controllers\clientsController.ts
    let query = `
      SELECT 
        c.*,
        cg.id as group_table_id,
        cg.name as group_table_name,
        wa.wa_url AS whatsapp_avatar_url
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
      LEFT JOIN client_groups cg ON c.group_id = cg.id
      LEFT JOIN LATERAL (
        ...
        FROM chat_conversations cc
        INNER JOIN users cu ON cu.id = cc.user_id AND cu.tenant_id = $1
        WHERE cc.client_id = c.id
```

**Observação:** filtro de tenant explícito em `clients` e nas conversas do lateral join.  
**Risco residual:** `LEFT JOIN client_groups cg ON c.group_id = cg.id` **sem** `cg.user_id`/`tenant` no join — integridade depende de não existir `group_id` apontando para outro tenant (ver §4).

### 3.2 Leads — listagem análoga (`u.tenant_id = $1`)

Trecho em `leadsController.getLeads`: `INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1` (arquivo `packages/backend/src/controllers/leadsController.ts`).

### 3.3 Chat — matching por telefone (escopo tenant explícito)

```68:82:c:\CURSOR\painelcrm\packages\backend\src\services\conversationMatchingService.ts
  const clients = await pool.query<{ id: string }>(
    `
    SELECT c.id
    FROM clients c
    INNER JOIN users u ON u.id = c.user_id
    WHERE u.tenant_id = $1
      AND c.phone IS NOT NULL
      ...
    `,
    [input.tenantId, normalizedPhone]
  );
```

**Conclusão:** o match **não** é global: depende de `input.tenantId` (derivado do dono da instância em `upsertConversation`).

### 3.4 Chat — `getClientMessages`: isolamento por **dono do cliente**, não por tenant

```2519:2543:c:\CURSOR\painelcrm\packages\backend\src\controllers\chatController.ts
    const clientResult = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND user_id = $2',
      [clientId, userId]
    );
    ...
      FROM chat_conversations c
      WHERE c.user_id = $1
        AND c.client_id = $2
```

**Problema de modelo (não é vazamento cross-tenant direto):** um colega **mesmo tenant** com outro `user_id` **não** passa neste check, embora RLS de `chat_conversations` permita visão por tenant. Isso é **inconsistência** entre “isolamento por tenant” e “isolamento por user_id” na API.

### 3.5 Faturas públicas — token único + função `SECURITY DEFINER`

```14:53:c:\CURSOR\painelcrm\database\init\77_payment_token_customer_invoices.sql
CREATE OR REPLACE FUNCTION public.get_customer_invoice_by_payment_token(p_token UUID)
...
  FROM customer_invoices ci
  LEFT JOIN clients c ON c.id = ci.client_id
  WHERE ci.payment_token = p_token
  LIMIT 1;
```

**Risco:** não é vazamento entre tenants sem o token; o vetor é **token vazado/adivinhado** (UUID forte mitiga adivinhação). A função **ignora RLS** de propósito.

### 3.6 Itens de fatura — só `invoice_id`

```337:346:c:\CURSOR\painelcrm\packages\backend\src\services\customerInvoiceService.ts
export async function getCustomerInvoiceItems(invoiceId: string): Promise<CustomerInvoiceItemRow[]> {
  ...
     FROM customer_invoice_items
     WHERE invoice_id = $1
```

**Risco estrutural:** a tabela **não tem RLS**. Quem chama deve garantir que `invoiceId` pertence ao tenant. Um bug futuro que passe UUID de outra fatura **expõe linhas** sem passar por `customer_invoices` RLS.

---

## 4. Chat / webhook — achado **CRÍTICO**

### 4.1 Resolução de instância sem `tenant_id`

```3802:3817:c:\CURSOR\painelcrm\packages\backend\src\controllers\chatController.ts
    let instanceResult = await pool.query<ChatInstanceRow>(
      'SELECT * FROM chat_instances WHERE external_instance_name = $1 LIMIT 1',
      [instanceName]
    );

    if (instanceResult.rowCount === 0) {
      ...
      instanceResult = await pool.query<ChatInstanceRow>(
        'SELECT * FROM chat_instances WHERE name = $1 LIMIT 1',
        [instanceName]
      );
    }
```

No schema original, a unicidade de nome de instância é **por usuário**, não global:

```13:14:c:\CURSOR\painelcrm\database\init\15_create_chat_tables.sql
  UNIQUE(user_id, name)
);
```

**Cenário de falha:** dois usuários (de **tenants diferentes**) com instância `name = 'Principal'` (ou qualquer nome colisionando com o que a UazAPI envia no webhook). O fallback `WHERE name = $1 LIMIT 1` escolhe **uma linha arbitrária** → mensagens podem ser gravadas na instância/conversas do **tenant errado**.

**Severidade:** **crítica** (possível mistura de dados de chat entre contas).

### 4.2 Validação de secret opcional / ausente

Se `UAZAPI_WEBHOOK_SECRET` não estiver configurado, o handler **aceita** o corpo e resolve instância só pelo nome identificado no payload — superfície de abuso maior (dependendo do formato dos nomes que a UazAPI envia).

### 4.3 Log de debug com amostra de instâncias

```3821:3823:c:\CURSOR\painelcrm\packages\backend\src\controllers\chatController.ts
      const allInstances = await pool.query<ChatInstanceRow>(
        'SELECT id, name, external_instance_name FROM chat_instances LIMIT 10'
      );
```

**Risco:** vazamento de metadados em logs (não é cross-tenant por si só, mas é ruído operacional/sensível).

---

## 5. Integridade referencial / “tenant errado” sem vazar leitura

### 5.1 `createClient` e `group_id`

Não há verificação explícita de que `group_id` pertence ao mesmo tenant antes do `INSERT` (`clientsController.ts` — validação UUID apenas). FK `clients.group_id → client_groups.id` **não** amarra tenant. **Efeito:** possível `group_id` inválido cross-tenant; leitura pode mascarar com RLS em `client_groups`, mas o dado fica **inconsistente**.

### 5.2 `migrateConversationLeadToClient`

O `UPDATE` restringe por `conversation id` + `user_id` do dono da conversa, mas **não** revalida que `clientId` pertence ao mesmo tenant antes de gravar (o chamador em `leadsController` filtra por `tenant_id` — mitigação **por chamada**, não **na função**).

---

## 6. RLS (PostgreSQL) — recorte das políticas de CRM

Política típica para `clients` / `leads` / `chat_*`:

```147:151:c:\CURSOR\painelcrm\database\init\57_rls_tenant_isolation.sql
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
...
CREATE POLICY clients_tenant_policy ON public.clients FOR ALL
  USING (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()))
  WITH CHECK (public.app_can_bypass_rls() OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id()));
```

**Interpretação:** o isolamento **não** é “`WHERE tenant_id = $tenant` na linha”; é “`user_id` pertence a **algum** usuário com `users.tenant_id` igual ao da sessão”. Isso é equivalente a tenant **desde que** todos os `user_id` daquele tenant estejam corretamente preenchidos em `users.tenant_id`.

---

## 7. Teste real (roteiro + SQL) — evidência em ambiente

### 7.1 Teste funcional (dois tenants, mesmo telefone)

1. Criar tenant A e tenant B (dois cadastros distintos).  
2. Em A, criar cliente com telefone `5511999999999`.  
3. Em B, criar cliente com o **mesmo** telefone.  
4. Sincronizar chat / receber webhook na instância de B.

**Resultado esperado (código atual de match):** `resolveConversationMatch` usa `tenantId` do dono da instância → cada lado resolve **apenas** clientes do seu tenant. **Não** há match global por telefone nesse serviço.

### 7.2 Teste de colisão de nome de instância (webhook)

1. Dois usuários em tenants diferentes, ambos com `chat_instances.name` igual ao valor que a UazAPI envia no webhook quando `external_instance_name` não casa.  
2. Disparar webhook sintético com esse `instanceName`.  
3. Observar qual `instance_id` foi escolhido (`LIMIT 1`).

**Resultado esperado hoje:** comportamento **não determinístico** / errado possível — **falha de isolamento**.

### 7.3 Queries SQL sugeridas (auditoria de dados existentes)

**Clientes cujo `user_id` não bate com o tenant esperado (usuário sem tenant ou tenant divergente):**

```sql
SELECT c.id, c.user_id, u.tenant_id
FROM clients c
LEFT JOIN users u ON u.id = c.user_id
WHERE u.id IS NULL OR u.tenant_id IS NULL;
```

**Conversas com `client_id` apontando para cliente cujo dono (`clients.user_id`) está em outro tenant que o dono da conversa (anomalia):**

```sql
SELECT cc.id AS conversation_id,
       cc.user_id AS conv_owner_user_id,
       uc.tenant_id AS conv_owner_tenant,
       c.id AS client_id,
       c.user_id AS client_owner_user_id,
       ucl.tenant_id AS client_owner_tenant
FROM chat_conversations cc
JOIN users uc ON uc.id = cc.user_id
LEFT JOIN clients c ON c.id = cc.client_id
LEFT JOIN users ucl ON ucl.id = c.user_id
WHERE c.id IS NOT NULL
  AND uc.tenant_id IS DISTINCT FROM ucl.tenant_id;
```

**Grupos de cliente usados por cliente de outro “mundo” (via `user_id` do grupo vs do cliente):**

```sql
SELECT c.id AS client_id, c.group_id, c.user_id AS client_user,
       g.user_id AS group_owner_user,
       uc.tenant_id AS client_tenant,
       ug.tenant_id AS group_tenant
FROM clients c
JOIN client_groups g ON g.id = c.group_id
JOIN users uc ON uc.id = c.user_id
JOIN users ug ON ug.id = g.user_id
WHERE uc.tenant_id IS DISTINCT FROM ug.tenant_id;
```

**Timeline: `tenant_id` inconsistente com o tenant do dono do cliente:**

```sql
SELECT e.id, e.tenant_id AS event_tenant,
       uc.tenant_id AS client_owner_tenant
FROM client_timeline_events e
JOIN clients c ON c.id = e.client_id
JOIN users uc ON uc.id = c.user_id
WHERE e.tenant_id IS DISTINCT FROM uc.tenant_id;
```

*(Executar no ambiente real; resultados vazios = bom sinal para essas anomalias.)*

---

## 8. Pontos de risco (resumo)

| ID | Severidade | Descrição |
|----|------------|-----------|
| R1 | **Crítica** | Webhook: fallback `SELECT ... FROM chat_instances WHERE name = $1 LIMIT 1` com `UNIQUE(user_id, name)` apenas — colisão cross-tenant possível. |
| R2 | Alta | Tabelas com dados sensíveis **sem RLS**: `subscriptions`, `customer_invoice_items`, `payment_customers`, `billing_recurring_jobs`, `client_timeline_events`. |
| R3 | Alta | `getCustomerInvoiceItems` / rotas que o chamam: dependência total em “invoiceId confiável”; sem segunda barreira no banco. |
| R4 | Média | API mistura critérios: listagens por tenant vs `getClientMessages` por `user_id` do cliente. |
| R5 | Média | `createClient` não valida `group_id`/`profile_id` contra tenant antes de inserir. |
| R6 | Baixa/Média | `uq_client_timeline_events_event_key` único global em `event_key` — colisão cross-tenant pode silenciar evento (`ON CONFLICT DO NOTHING`). |
| R7 | Operacional | Jobs/workers usam `pool` sem contexto HTTP — esperado para scheduler, mas exige queries **sempre** escopadas por `tenant_id`/`subscription_id` corretos no código. |

---

## 9. Correções necessárias (prioridade)

1. **Webhook:** remover ou endurecer o fallback por `name`; resolver instância por **`external_instance_name`** garantido único **ou** por `(user_id + name)` somente após identificar o usuário/tenant por token assinado/cabeçalho confiável; nunca `LIMIT 1` global em nome ambíguo.  
2. **RLS:** adicionar políticas para `client_timeline_events`, `customer_invoice_items` (via join a `customer_invoices`), `subscriptions`, `payment_customers`, `billing_recurring_jobs` alinhadas a `tenant_id`.  
3. **API:** alinhar `getClientMessages` (e similares) ao critério de tenant usado em `getClients` / `getClientById`.  
4. **Validação:** ao criar/atualizar cliente, validar `group_id` e `profile_id` contra o tenant do request.  
5. **Durante hardening:** incluir `client_timeline_events` (e outras tabelas novas) em `tenantSecurity.TENANT_SCOPED_TABLES` e revisar `assertTenantScopedQuery`.

---

## 10. Plano de hardening (fases)

| Fase | Ação |
|------|------|
| H0 | Rodar SQLs da §7.3 em produção/staging; registrar contagens. |
| H1 | Corrigir resolução de instância no webhook + obrigatoriedade de secret em produção. |
| H2 | Migrações RLS para tabelas listadas em R2 + testes de regressão com `SET LOCAL app.current_tenant_id`. |
| H3 | Padronizar controllers: toda leitura/escrita de negócio com `tenant_id` explícito **ou** join `users.tenant_id` + testes de API com dois tenants. |
| H4 | Teste automatizado: dois tenants, mesmo telefone, sync + webhook simulado — assert de não-cruzamento de `chat_conversations`/`chat_messages`. |

---

## 11. Declaração explícita

- **Não** foi possível executar as queries da §7.3 neste ambiente (sem acesso ao banco de produção). A auditoria é **estática** (código + migrations).  
- **Qualquer** rota ou script que use `pool`/`connect` sem `setRequestDb` e toque tabelas **sem** RLS deve ser tratada como **candidata a vazamento** até prova em contrário.

---

*Documento gerado como entrega de auditoria; alterações de código devem seguir PRs separados com testes e migrações revisadas.*
