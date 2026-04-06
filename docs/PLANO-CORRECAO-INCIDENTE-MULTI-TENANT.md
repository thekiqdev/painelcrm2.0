# Plano de Correção — Incidente Multi-tenant

Documento de planejamento (sem implementação nesta entrega).  
Base: auditoria estática em `docs/AUDITORIA-ISOLAMENTO-MULTI-TENANT.md` e código/migrations do repositório.

---

## 1. Resumo executivo

O incidente concentra-se em **garantir que dados de um tenant nunca sejam gravados ou expostos por engano a outro**. Os vetores já identificados diferem em severidade e em **risco de deploy**:

- **Maior risco operacional imediato:** resolução da instância de chat no **webhook** com fallback `WHERE name = $1 LIMIT 1`, colidindo com `UNIQUE(user_id, name)` (não global). Isso pode **misturar conversas/mensagens entre contas** sem depender de bug de listagem.
- **Maior risco estrutural (não necessariamente exploit trivial):** tabelas sensíveis **sem RLS**, dependendo só da aplicação e do pool correto.
- **Dívida de produto/segurança:** APIs que misturam critério **por `user_id`** e **por tenant**, e validações fracas de `group_id` / `profile_id`.

A estratégia proposta é **cinco etapas sequenciais**, com **Etapa 1 como hotfix obrigatório antes** de expandir RLS em produção, e **Etapa 2** em rollout controlado com validação em staging.

---

## 2. Riscos críticos já confirmados

| ID | Risco | Evidência (referência) |
|----|--------|-------------------------|
| C1 | Webhook associa instância por `name` com `LIMIT 1` → colisão cross-tenant | `chatController.handleWebhook` + `chat_instances UNIQUE(user_id, name)` |
| C2 | Webhook sem secret configurado aceita tráfego; superfície maior se identificador de instância for previsível | `UAZAPI_WEBHOOK_SECRET` opcional no fluxo atual |
| C3 | `client_timeline_events`, `customer_invoice_items`, `subscriptions`, `payment_customers`, `billing_recurring_jobs` sem RLS nas migrations atuais | `AUDITORIA-ISOLAMENTO-MULTI-TENANT.md` §1.1 / §8 |
| C4 | `getClientMessages` isola por `clients.user_id = req.userId` (inconsistente com listagens por tenant) | `chatController.getClientMessages` |
| C5 | `createClient` / updates: `group_id` (e `profile_id`) sem validação explícita de pertença ao tenant | `clientsController` |
| C6 | Dependência histórica de `user_id` + join `users.tenant_id` para CRM (sem `tenant_id` nas linhas de `clients`/`leads`) | `04_create_leads_and_clients.sql`, RLS em `57_rls_tenant_isolation.sql` |

*Contaminação de dados (C7):* possível **desalinhamento** conversa↔cliente ou cliente↔grupo; **não assumir** ausência sem rodar SQLs da Etapa 4.

---

## 3. Estratégia de correção por etapas

1. **Primeiro** eliminar qualquer caminho que **escreva** dados no tenant errado (webhook) — **baixo acoplamento** com o restante do schema.
2. **Depois** reforçar o banco com **RLS** em tabelas que hoje confiam só no app — **exige** que todas as queries relevantes passem por sessão com `app.current_tenant_id` ou bypass explícito (workers/superadmin).
3. **Em paralelo ou logo após Etapa 2 em staging:** alinhar controllers e validações para **um critério dominante** (tenant) nas APIs afetadas.
4. **Auditoria somente após** hotfix do webhook (para não misturar novos eventos ruins com análise) e **antes** de declarar incidente encerrado.
5. **Validação final** com cenários A/B e, quando possível, testes automatizados.

**Princípio:** etapas **pequenas**, PRs **separados**, feature flags / config só onde necessário (ex.: exigir secret em produção).

---

## 4. Etapa 1 — Correção crítica imediata

**Objetivo:** impedir que o webhook **associe payload à instância errada**.

### 4.1 Escopo técnico

1. **Remover ou neutralizar o fallback inseguro**  
   - Hoje: `SELECT * FROM chat_instances WHERE name = $1 LIMIT 1`.  
   - Direção: **não** resolver instância só por `name` global. Opções (escolher uma na implementação):
     - **A (preferencial):** usar **apenas** `external_instance_name` (ou campo que a UazAPI garanta único no provedor) + índice único parcial no banco se necessário.
     - **B:** se `external_instance_name` estiver vazio, **não** fazer match por `name`; retornar 404 e log estruturado; forçar cadastro/sync que preencha identificador estável.
     - **C:** match por `(name, user_id)` somente se o webhook trouxer **token ou assinatura** que identifique o `user_id`/instância (ex.: segredo por instância) — mais trabalho, maior segurança.

2. **Secret em produção**  
   - Definir política: em `NODE_ENV=production` (ou variável explícita `UAZAPI_WEBHOOK_REQUIRE_SECRET=true`), **rejeitar** webhook se secret esperado não for validado (quando a UazAPI enviar o header/campo).  
   - Documentar exceção só para ambientes de dev com flag clara.

3. **Logs**  
   - Remover ou restringir query `SELECT ... FROM chat_instances LIMIT 10` em caminho de erro (vazamento de metadados em log).

4. **Mensagens já gravadas errado**  
   - Etapa 1 **não** apaga dados; apenas **para o sangramento**. Saneamento fica na Etapa 4.

### 4.2 Entregáveis

- PR único e pequeno: alterações em `chatController` (webhook) + possivelmente migration com **UNIQUE** em `external_instance_name` onde aplicável (se a regra de negócio permitir e após checar duplicatas).

### 4.3 Risco de deploy

**Baixo** se não houver dependência de fallback por `name` em produção real. **Médio** se muitos ambientes dependem só de `name` — exige checklist de pré-deploy (ver Etapa 4, amostragem de instâncias).

**Classificação:** **hotfix crítico** — deve ser a **primeira** alteração de código em produção deste plano.

---

## 5. Etapa 2 — Blindagem de banco e RLS

**Objetivo:** segunda barreira no PostgreSQL para tabelas listadas na auditoria.

### 5.1 Migrations a criar (novo arquivo SQL numerado, ex.: `88_rls_*`)

| Tabela | Coluna de escopo | Política sugerida (alto nível) |
|--------|------------------|--------------------------------|
| `client_timeline_events` | `tenant_id` | `USING` / `WITH CHECK` com `app_tenant_visible(tenant_id)` (mesmo padrão de `customer_charges`) |
| `customer_invoice_items` | indireto | `EXISTS` em `customer_invoices` com `ci.id = invoice_id AND app_tenant_visible(ci.tenant_id)` |
| `subscriptions` | `tenant_id` | política por `tenant_id` |
| `payment_customers` | `tenant_id` | política por `tenant_id` |
| `billing_recurring_jobs` | `tenant_id` | política por `tenant_id` |

### 5.2 Impacto em rotas e workers

- **Rotas com `tenantAuth` + `setRequestDb`:** continuam com `app.current_tenant_id` — RLS deve **alinhar** com o que o app já filtra.
- **Workers / jobs** (`enqueueRenewalJobs`, `processNextBatch`, etc.): usam `pool.connect()` **fora** do middleware — é **obrigatório** em cada transação/batch:
  - `SET LOCAL app.bypass_rls = '1'` **somente** para papel técnico confinado, **ou**
  - `SET LOCAL app.current_tenant_id = '<uuid>'` por job ao processar linhas daquele tenant, **ou**
  - conexão de role `BYPASSRLS` só no worker (último recurso, documentado).

**Sem** esse alinhamento, Etapa 2 **quebra** faturamento recorrente ou pagamentos.

### 5.3 Ordem dentro da Etapa 2

1. Implementar RLS em **staging** + rodar suíte de smoke (login, fatura, job manual).  
2. Tabelas com **menor** tráfego de escrita concorrente primeiro, se quiser subdividir: ex. `client_timeline_events` antes de `subscriptions`.  
3. **Não** misturar com mudanças grandes de aplicação no mesmo PR.

**Classificação:** **rollout controlado** — maior risco de regressão se workers não forem ajustados na mesma janela.

---

## 6. Etapa 3 — Correções de aplicação

**Objetivo:** consistência e defesa em profundidade na camada HTTP/serviços.

### 6.1 Mapeamento (arquivos / áreas)

| Item | Ação |
|------|------|
| `getClientMessages` | Trocar verificação de cliente de `user_id = req.userId` para **pertence ao tenant** (`req.tenantId` + join `users.tenant_id`, ou reutilizar helper tipo `clientBelongsToTenant`). Alinhar query de conversas a usuários do mesmo tenant se o produto exigir visão compartilhada. |
| `createClient` / `updateClient` | Validar `group_id`: existe e `client_groups.user_id` (ou política equivalente) pertence ao tenant do request. Validar `profile_id`: membro do tenant / perfil acessível conforme regra de produto. |
| `conversationLinkService.migrateConversationLeadToClient` | Opcional (fortalecimento): validar `clientId` contra tenant do `userId` da conversa antes do `UPDATE`. |
| `getCustomerInvoiceItems` e chamadores | Garantir que **sempre** haja `getInvoice` / check `tenant_id` antes de listar itens (defesa quando RLS da Etapa 2 ainda não estiver em todos os ambientes). |
| `tenantSecurity.ts` | Incluir `client_timeline_events` e outras tabelas novas na lista de alertas em desenvolvimento. |

### 6.2 Critério único de isolamento (diretriz)

- **Leitura/listagem de negócio:** preferir **`tenant_id` do request** + join em `users` onde a linha não tem `tenant_id`.  
- **`user_id` na linha:** continua sendo ownership/creator, não substituto de checagem de tenant em endpoints colaborativos.

**Classificação:** pode ser **vários PRs** pequenos após Etapa 1; idealmente **após ou em conjunto com Etapa 2 em staging**, antes de produção para RLS.

---

## 7. Etapa 4 — Auditoria de dados existentes

**Objetivo:** detectar **contaminação** já persistida; tratar com critério (não delete em massa sem evidência).

### 7.1 Queries (rodar no banco real — cópias em `AUDITORIA` §7.3)

1. Clientes com `user_id` inexistente ou usuário sem `tenant_id`.  
2. Conversas com `client_id` cujo dono do cliente está em **tenant diferente** do dono da conversa.  
3. Clientes com `group_id` apontando para grupo cujo dono está em **tenant diferente**.  
4. Timeline: `client_timeline_events.tenant_id` ≠ tenant derivado de `clients.user_id`.  
5. Amostra: instâncias `chat_instances` com mesmo `name` e `external_instance_name` nulos (risco histórico para webhook).  
6. Duplicatas `(name)` cross-user quando `external_instance_name` vazio (para priorizar correção de dados ou migração).

### 7.2 Tratamento

- **Registrar** contagens e exemplos (IDs) em ticket de incidente.  
- **Correções manuais** ou scripts **idempotentes** por caso (ex.: realinhar `client_id` nulo em conversa, remover vínculo inválido).  
- **Não** apagar mensagens/conversas sem aprovação e backup.

**Quando rodar:** após Etapa 1 em produção (para não continuar poluindo), e **antes** de declarar “incidente encerrado”.

---

## 8. Etapa 5 — Testes de isolamento e hardening

### 8.1 Manuais (obrigatório mínimo)

- **Tenant A** e **Tenant B**, usuários distintos.  
- Mesmo telefone em cliente A e B; sync/chat; verificar que match e conversas não cruzam.  
- Webhook (staging): payload com identificador que antes caía no fallback por `name` — deve falhar de forma segura ou acertar instância única.  
- Colegas **mesmo tenant**: após Etapa 3, `getClientMessages` (ou equivalente) conforme regra de produto.

### 8.2 Automatizados (desejável)

- Teste de integração: duas “contas” no banco de teste, chamadas API com tokens diferentes, assert de 404/empty para IDs do outro tenant.  
- Teste do webhook com duas instâncias de nomes colidentes (regressão Etapa 1).

### 8.3 Hardening contínuo

- Revisão periódica de rotas sem `setRequestDb`.  
- Checklist em PR: queries novas em tabelas tenant-scoped.

---

## 9. Ordem recomendada de deploy

1. **Etapa 1** (hotfix webhook + política de secret) → **produção assim que validado em staging**.  
2. **Etapa 4** (somente leitura / relatório) em paralelo ou imediatamente após Etapa 1 — **sem** alterar schema.  
3. **Etapa 2** (migrations RLS + ajuste workers) → staging completo → produção em janela com monitoramento.  
4. **Etapa 3** → PRs incrementais; preferir staging-first.  
5. **Etapa 5** → gate antes de fechar incidente; repetir após Etapa 2 em prod.

---

## 10. Plano de rollback

| Etapa | Rollback |
|-------|----------|
| 1 | Reverter deploy da versão anterior do backend; reativar fallback **só** se for emergência operacional — documentar como risco aceito temporário. Preferir **forward-fix**. |
| 2 | Migration `DOWN` ou `DROP POLICY` + `DISABLE ROW LEVEL SECURITY` em tabelas afetadas (script preparado antecipadamente); reverter workers para versão anterior se necessário. |
| 3 | Revert por PR; dados já validados na Etapa 4 não dependem só dessas mudanças. |
| 4 | N/A (leitura); scripts de correção de dados devem ter backup/preview. |
| 5 | N/A |

Manter **backup de banco** antes de Etapa 2 e antes de qualquer script de mutação da Etapa 4.

---

## 11. Critérios de aceite por etapa

| Etapa | Aceite |
|-------|--------|
| **1** | Nenhum caminho de produção resolve instância só por `name` global com `LIMIT 1`; política de secret documentada e aplicada em prod; logs sem vazamento desnecessário de instâncias. |
| **2** | Todas as tabelas alvo com RLS ativo; workers e rotas críticas validadas em staging; zero erro 500 em fluxos billing/chat principais. |
| **3** | `getClientMessages` e validações de grupo/perfil conforme spec de produto; code review com checklist tenant. |
| **4** | Relatório com contagens; plano de correção para cada classe de anomalia encontrada ou declaração explícita “zero ocorrências”. |
| **5** | Cenários A/B executados e registrados; regressão webhook passando. |

---

## 12. Riscos de rollout

| Risco | Mitigação |
|-------|-----------|
| Webhook para de processar após remover fallback | Pré-audit Etapa 4 item 5–6; preencher `external_instance_name`; comunicação ao suporte |
| Jobs de billing falham após RLS | Ajustar worker **no mesmo release** ou imediatamente antes; teste de job em staging |
| Performance com políticas RLS complexas | Índices alinhados a `tenant_id` / FKs; `EXPLAIN` em queries quentes |
| Falso sentimento de segurança | Etapa 4 obrigatória antes de encerrar incidente |

---

## O que começa agora (síntese operacional)

- **Começar agora:** **Etapa 1** (planejamento já concluído neste documento; próximo passo é implementação em PR dedicado).  
- **Hotfix crítico:** **Etapa 1** apenas.  
- **Maior cuidado de rollout:** **Etapa 2** (RLS + workers).  
- **Etapas 3–5:** seguem na ordem da §9, com aceites da §11.

---

*Documento de plano — implementação deliberadamente fora do escopo desta entrega.*
