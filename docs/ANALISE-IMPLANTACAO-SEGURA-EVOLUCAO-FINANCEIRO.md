# Análise de Implantação Segura — Evolução do Financeiro

**Fonte principal:** `docs/PLANO-EVOLUCAO-FATURAS-E-FINANCEIRO.md`  
**Escopo:** Comparar o plano com o estado atual do código; definir fases seguras, riscos e ordem ideal. Sem implementação.

---

## 1) Documento analisado

- **Arquivo:** `docs/PLANO-EVOLUCAO-FATURAS-E-FINANCEIRO.md`
- **Conteúdo resumido:**  
  - Estado atual: dois sistemas de fatura (customer_invoices com gateway vs invoices do Finance com itens JSONB); menus Faturamento (placeholder), Faturas de clientes, Financeiro.  
  - **Ponto 1:** Unificação de menu/rotas e relatório financeiro (receitas = customer_invoices + opcionalmente invoices; despesas = expenses).  
  - **Ponto 2:** Faturas de clientes mais robustas (página única, itens, produtos/serviços, link único de pagamento, recorrente, client_id nullable, sync Asaas delete/cancel, notificationEnabled).  
  - **Ponto 3:** Cobrança (customer_charges + charge_id em customer_invoices).  
  - Ordem sugerida: menu/relatório → faturas parte 1 (itens, produtos, link) → faturas parte 2 (recorrente, sem cliente, sync Asaas) → cobrança.

---

## 2) Estado atual vs plano

### 2.1 O que já existe (preservar)

| Item | Estado no código | Observação |
|------|------------------|------------|
| **customer_invoices** | Tabela com tenant_id, client_id, subscription_id (nullable), amount_cents, due_date, status, gateway, gateway_reference_id, gateway_metadata, gateway_status, origin, invoice_type, description, payment_method, idempotency_key | Multi-gateway já implantado; CHECK de status com 8 valores (migration 75). |
| **API customer-invoices** | GET list/preconditions/:id, POST create, PATCH (description/cancel) | Controller + customerBillingService + customerInvoiceService; criação via gateway (createCharge). |
| **Frontend Faturas de clientes** | `/customer-invoices` lista + modal 2 passos (pré-requisitos → dados), integração gateway | Fluxo funcional; client_id obrigatório. |
| **invoices (Finance)** | Tabela `invoices` com items JSONB; `/api/invoices`; página `/finance` com abas Faturas + Despesas + Resumo | Não usa gateway; relatório hoje só considera invoices + expenses. |
| **expenses** | Tabela `expenses`; `/api/expenses`; usado no Finance | Preservar. |
| **products** | Tabela `products` com type IN ('product', 'service'), price, etc. | user_id; uso em projetos/orçamentos; ainda não vinculado a customer_invoices. |
| **subscriptions + Billing Engine** | type=customer; recurringBillingJobService gera customer_invoices para ciclos | Recorrência “automática” já existe para type=customer. |
| **payment_gateway_configs** | Configuração por tenant (scope tenant); gateway_key; getActiveGateway/getActiveConfig | Configurações já em produção; não alterar estrutura. |
| **Webhook + payment_events** | Parser → webhookCore → paymentDomainService; idempotência; status 8 valores | Não mexer. |

### 2.2 O que o plano propõe e ainda não existe

| Item do plano | No código atual | Impacto se implementado |
|---------------|-----------------|---------------------------|
| Unificação menu (Opção A ou B) | Três itens: Faturamento, Faturas de clientes, Financeiro | Só frontend/rotas; sem mudar API nem banco. |
| Remover/redirecionar `/billing` | Página placeholder com “Em breve” | Baixo risco. |
| Relatório com receitas = customer_invoices (pagas) | FinancialSummary usa apenas invoices + expenses | Requer backend (agregação customer_invoices) e frontend; invoices e expenses continuam como estão. |
| Página única de criação `/customer-invoices/new` | Criação em modal | UX; API atual suporta. |
| Itens na fatura | customer_invoices sem itens; só amount_cents | Nova tabela customer_invoice_items ou JSONB; migration + API + UI. |
| Produtos/serviços na fatura | products existe; não vinculado a customer_invoices | Depende de itens; listar por tenant (via users). |
| Link único de pagamento (token) | Não existe | Nova coluna (ex.: payment_token UNIQUE); rota pública GET; pode exigir gateway para “payment link”. |
| Fatura recorrente na UI | Worker já gera customer_invoices para subscriptions type=customer | Opção “Recorrente” na criação = criar subscription + talvez primeira fatura; reuso do que já existe. |
| client_id nullable | client_id NOT NULL em customer_invoices (70/71) | Migration sensível; quebra suposição em vários SELECTs e no createManualInvoice (sempre exige client_id). |
| Sync Asaas (DELETE/cancel) | Não há chamada DELETE no gateway | Novo comportamento ao cancelar/excluir fatura; verificar documentação Asaas. |
| notificationEnabled: false | Não enviado no create payment | Alteração no payload do gateway; baixo risco. |
| customer_charges + charge_id | Não existem | Nova tabela + FK em customer_invoices; regra de “quitado” ao marcar fatura paga. |

### 2.3 Conflitos ou pontos de atenção

- **Relatório unificado:** Incluir customer_invoices (receitas reais com gateway) no mesmo relatório que invoices (finance) exige definir claramente: duas fontes de “receita” (customer_invoices pagas vs invoices pagas) e como exibir (abas, totais separados ou consolidados). Não conflita com tabelas; pode conflitar com expectativa de “uma única lista de faturas”.
- **client_id nullable:** Vários pontos assumem client_id presente (listInvoices filtro, createManualInvoice, preconditions). Tornar nullable exige tratar “fatura sem cliente” em toda a cadeia (listagem, detalhe, link de pagamento, webhook não altera cliente).
- **Itens na fatura:** Decisão entre customer_invoice_items (normalizado) e items JSONB. Ambas exigem migration; JSONB evita nova tabela mas dificulta vínculo com products e relatórios por produto.
- **Link único:** Token público não deve colidir com id; rota pública não deve expor dados sensíveis; gateway pode precisar de “payment link” ou manter fluxo atual (uma cobrança por método).

---

## 3) Fases seguras de implantação

### Fase 0 — Pré-requisito (sem risco)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Nenhuma alteração de schema | Apenas validar que o plano está alinhado ao código | Nenhum | Nenhum | Nenhum | Nenhum | Nenhum | — |

### Fase 1 — Menu e rota (baixo risco)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Unificação menu | Redirecionar “Faturamento” para “Faturas de clientes” ou unificar em um item “Financeiro” com abas | Nenhum | Nenhum (ou só redirecionamento) | AppLayout: um item a menos ou redirecionar /billing → /customer-invoices | Nenhum | Baixo | Decisão Opção A vs B |
| Remover placeholder /billing | Eliminar página “Em breve” como destino final | Nenhum | Nenhum | Rota /billing redireciona ou some do menu | Nenhum | Baixo | — |

**Recomendação:** Fazer primeiro. Não mexe em customer_invoices, gateway nem relatório; apenas navegação.

### Fase 2 — Relatório financeiro (médio risco, controle no backend)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Receitas no relatório | Incluir customer_invoices (status=paid) como fonte de receita | Nenhum | Novo endpoint ou estender um existente para agregar totais por período (customer_invoices pagas); manter /api/invoices e /api/expenses | FinancialSummary: receber nova fonte “receitas cobrança” e exibir junto ou em aba separada | Nenhum | Médio (lógica de agregação e permissões) | Definir se relatório mostra “receitas cobrança” + “receitas invoices” separados ou consolidados |

**Recomendação:** Fazer após Fase 1. Não altera estrutura de customer_invoices nem de gateway; apenas adiciona leitura e exibição.

### Fase 3 — UX faturas (baixo risco)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Página única de criação | Rota `/customer-invoices/new` com formulário (mesmos campos atuais) | Nenhum | Nenhum (POST já existe) | Nova página; substituir ou complementar modal | Nenhum | Baixo | — |
| Aviso + atalho Asaas | No topo da tela, aviso “Configure o gateway” + link para configuração; remover popup de check | Nenhum | Opcional: endpoint leve de “preconditions” já existe | Texto + link para config de pagamento | Nenhum | Baixo | — |
| Dados do cliente e CPF na tela | Ao selecionar cliente, exibir dados; editar CPF e salvar no cliente | Nenhum | Backend já suporta CPF (clients); PATCH client se necessário | Formulário exibe e edita CPF; salva no perfil | Nenhum | Baixo | — |

**Recomendação:** Pode ser feita em paralelo ou logo após Fase 2. Não altera modelo de dados nem gateway.

### Fase 4 — Itens na fatura (estrutural; médio-alto risco)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Itens por fatura | Linhas com descrição, qtd, valor, desconto; total calculado | Nova tabela customer_invoice_items **ou** coluna items JSONB em customer_invoices | CRUD de itens ou persistência de items; total calculado; createManualInvoice passa a aceitar itens (e opcionalmente manter amount_cents para compatibilidade) | Tela de criação com linhas; total automático | Gateway continua recebendo um valor total (soma dos itens); sem mudança de contrato | Médio-alto (migration + compatibilidade com faturas existentes sem itens) | Decisão: tabela vs JSONB |

**Recomendação:** Só após Fases 1–3. Garantir que faturas antigas (só amount_cents) continuem válidas: ou itens opcionais (retrocompatível) ou migration que preenche “um item” por fatura existente.

### Fase 5 — Produtos/serviços na fatura (depende de itens)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Vincular produtos | Listar produtos do tenant na criação; adicionar linha do catálogo (preço sugerido, editável) | Nenhum (products já existe) ou product_id em customer_invoice_items | Listar products por tenant (via user_id/tenant); opção “do catálogo” na criação de linha | Dropdown/autocomplete produto; preço pré-preenchido editável | Nenhum | Médio (products pode ser user_id; garantir escopo tenant) | Fase 4 (itens) |

### Fase 6 — Link único de pagamento (médio risco)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Token e rota pública | payment_token (UUID/slug) em customer_invoices; GET público por token; página com itens, total, forma de pagamento | Nova coluna UNIQUE; índice | Endpoint GET público (sem auth) por token; retorna fatura (itens, total, status); redirecionar para URLs do gateway ou exibir QR | Página pública /pay/:token (ou similar) | Pode precisar de “payment link” no gateway ou manter criação de cobrança por método | Médio (segurança do token; não expor dados sensíveis) | Fase 4 se quiser itens no link; pode ser só amount_cents no início |

**Recomendação:** Token e GET público podem ser feitos com modelo atual (só amount_cents); itens no link dependem de Fase 4.

### Fase 7 — Recorrente na UI (baixo risco se reutilizar subscriptions)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Opção “Fatura recorrente” | Na criação, checkbox “Recorrente”; ao salvar, criar subscription (type=customer) + primeira fatura ou só subscription | Nenhum (subscriptions já existe) | Criar subscription + opcionalmente primeira customer_invoice; worker já gera as demais | Checkbox e talvez periodicidade | Nenhum | Baixo | Billing Engine existente |

### Fase 8 — client_id nullable e “fatura sem cliente” (alto risco)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| client_id nullable | Faturas por link sem cliente cadastrado | ALTER customer_invoices.client_id DROP NOT NULL; checar FKs e índices | createManualInvoice e list/get devem aceitar client_id null; preconditions não se aplicam; webhook não preenche client_id | Formulário “por link” sem cliente | Gateway pode exigir “customer”; criar cliente anônimo ou usar tenant como customer | Alto (quebra suposição em vários pontos) | Link único (Fase 6); formulário no link para criar cliente e vincular |

**Recomendação:** Adiar até ter link único estável e formulário “preencher dados” no link; fazer em migration dedicada e revisar todos os usos de client_id.

### Fase 9 — Sync gateway (cancelar/excluir) e notificationEnabled (médio risco)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| DELETE no gateway | Ao cancelar/excluir fatura no sistema, chamar DELETE no Asaas (se houver gateway_reference_id e status permitir) | Nenhum | Novo comportamento no PATCH cancel ou em “excluir”; checar documentação Asaas | Nenhum ou feedback “cancelado no gateway” | Asaas: DELETE /payments/:id | Médio (idempotência; cobrança já paga/cancelada) | — |
| notificationEnabled: false | Incluir no body do create payment | Nenhum | Ajuste no adapter Asaas (request) | Nenhum | Asaas API | Baixo | — |

**Recomendação:** Pode ser feita sem depender de itens/link; preserva configurações existentes; só altera comportamento de cancelamento e payload de criação.

### Fase 10 — customer_charges (estrutural; médio risco)

| Aspecto | Objetivo | Impacto banco | Impacto backend | Impacto frontend | Impacto gateway | Risco | Dependências |
|---------|----------|----------------|-----------------|------------------|-----------------|-------|--------------|
| Cobrança como entidade | Tabela customer_charges; charge_id nullable em customer_invoices | Nova tabela; ADD COLUMN charge_id FK | CRUD cobranças; ao criar fatura, opção “Vincular à cobrança”; ao marcar fatura paga, recalcular status da cobrança | Tela Cobranças; select “Vincular à cobrança” na criação de fatura | Nenhum | Médio (nova entidade; regra de quitado) | Nenhuma obrigatória |

**Recomendação:** Fazer após as fases de faturas (itens/link) se o negócio exigir “cobrança com várias faturas”; não bloqueia nada do que já existe.

---

## 4) Pontos sensíveis e riscos

### 4.1 Unificação de menu/rotas

- **Risco:** Baixo. Apenas frontend e possivelmente redirecionamento.
- **Atenção:** Feature flags (hasInvoices, hasExpenses, billing) em RequireModuleView e AppLayout; manter permissões equivalentes ao unificar.

### 4.2 Evolução de customer_invoices

- **Risco:** Alto se alterar colunas usadas pelo webhook ou pelo worker. **Não alterar:** gateway_reference_id, gateway_metadata, gateway_status, status (CHECK já alinhado), idempotency_key.
- **Seguro:** Adicionar colunas opcionais (payment_token, charge_id após criar customer_charges); itens em tabela separada ou JSONB com fallback para amount_cents.

### 4.3 Itens de fatura (customer_invoice_items ou JSONB)

- **Risco:** Migration e compatibilidade com faturas existentes (sem itens). **Recomendação:** Tabela normalizada (customer_invoice_items) com invoice_id FK; faturas antigas seguem com amount_cents; criação nova pode gravar um “item resumo” ou manter amount_cents como soma.

### 4.4 Products/services na fatura

- **Risco:** products tem user_id; listar “produtos do tenant” exige join users.tenant_id; não alterar estrutura de products.

### 4.5 Link público de pagamento

- **Risco:** Token não adivinhável; rota sem auth; não expor dados sensíveis; CORS e rate limit se necessário.

### 4.6 Recorrência

- **Risco:** Baixo. Reutilizar subscriptions (type=customer) e worker existente; só expor na UI.

### 4.7 client_id nullable

- **Risco:** Alto. Exige revisão de listagens (WHERE client_id IS NOT NULL ou exibir “Sem cliente”), createManualInvoice (dois fluxos: com cliente vs por link), preconditions (não aplicar quando client_id null), e relatórios.

### 4.8 Sync com gateway ao cancelar/excluir

- **Risco:** Cobrança já paga ou já cancelada no gateway; tratar 4xx e não falhar o cancelamento no sistema; idempotência.

### 4.9 customer_charges

- **Risco:** Nova tabela e nova regra; não mexe em customer_invoices existentes além de adicionar charge_id nullable.

### 4.10 Unificação do relatório financeiro

- **Risco:** Lógica de agregação e permissões (só ler customer_invoices do tenant); não alterar tabelas; só adicionar fonte de dados.

---

## 5) O que deve ser preservado

### 5.1 Não alterar

- **Estrutura de customer_invoices:** Colunas de gateway (gateway, gateway_reference_id, gateway_metadata, gateway_status), status (CHECK com 8 valores), idempotency_key, origin, invoice_type. Não remover nem renomear.
- **Fluxo webhook:** Parser → webhookCore → paymentDomainService; payment_events; idempotência; canTransition e normalizeGatewayStatus.
- **APIs de customer-invoices:** GET list/preconditions/:id, POST (create), PATCH (description/cancel); contrato atual de request/response para criação (client_id, amount_cents, due_date, description, payment_method).
- **Configurações de gateway:** payment_gateway_configs; getActiveConfig/getActiveGateway; não mudar modelo de configuração já em produção.
- **Tabelas invoices e expenses:** Uso atual do Finance; não unificar com customer_invoices em uma única tabela.
- **Billing Engine e subscriptions type=customer:** Worker e criação de customer_invoices por ciclo.

### 5.2 Isolar em nova tabela ou nova camada

- **Itens da fatura:** Nova tabela customer_invoice_items (ou coluna JSONB) em vez de alterar amount_cents.
- **Cobrança:** Nova tabela customer_charges; charge_id em customer_invoices como FK opcional.
- **Link de pagamento:** Nova coluna (payment_token) e rota pública separada; não expor id interno.

### 5.3 Deixar para fases posteriores

- **client_id nullable** até ter link único e fluxo “preencher dados e vincular cliente” definido.
- **customer_charges** até priorizar faturas robustas (itens, link, recorrência na UI).
- **Mudanças no payload do gateway** além de notificationEnabled e DELETE apenas quando documentação e testes estiverem alinhados.

---

## 6) Ordem ideal de implementação

1. **Fase 1 — Menu e rota**  
   Redirecionar/remover “Faturamento” e unificar entrada (Opção A ou B). Sem toque em banco, API de pagamento ou webhook.

2. **Fase 2 — Relatório financeiro**  
   Backend: agregar customer_invoices (status=paid) por período; frontend: exibir no resumo junto com invoices/expenses (ou aba). Preserva tudo que existe.

3. **Fase 3 — UX faturas**  
   Página `/customer-invoices/new`, aviso + atalho gateway, dados do cliente e CPF na tela. Sem mudança de modelo.

4. **Fase 9 (parcial) — notificationEnabled**  
   Incluir parâmetro no create payment do Asaas. Baixo risco; não altera fluxo de cobrança existente.

5. **Fase 4 — Itens na fatura**  
   Decisão tabela vs JSONB; migration; API e tela com linhas; total calculado; compatibilidade com faturas sem itens.

6. **Fase 5 — Produtos/serviços na fatura**  
   Após itens; listar products por tenant e vincular linha ao catálogo.

7. **Fase 6 — Link único de pagamento**  
   payment_token; GET público; página de pagamento (inicialmente pode usar só amount_cents).

8. **Fase 7 — Recorrente na UI**  
   Opção “Recorrente” na criação; criar subscription type=customer; reuso do worker.

9. **Fase 9 (restante) — Sync gateway (DELETE)**  
   Ao cancelar/excluir fatura, chamar DELETE no gateway quando aplicável.

10. **Fase 8 — client_id nullable**  
    Só após link e formulário “sem cliente” estáveis; migration + revisão de todos os usos.

11. **Fase 10 — customer_charges**  
    Quando o negócio priorizar cobrança com múltiplas faturas.

---

## 7) Recomendação final

- **Começar por:** Fases 1 (menu), 2 (relatório com customer_invoices pagas) e 3 (UX: página única, aviso, CPF). Não alteram estrutura de customer_invoices nem de gateway e não quebram configurações de pagamento já criadas.
- **Em seguida:** notificationEnabled (Fase 9 parcial); depois itens (Fase 4) e produtos na fatura (Fase 5); em paralelo ou depois link único (Fase 6) e recorrente na UI (Fase 7).
- **Deixar para depois:** client_id nullable (Fase 8) e customer_charges (Fase 10), até que itens, link e relatório estejam consolidados.
- **Não fazer agora:** Refatoração ampla da arquitetura de pagamento; unificação de customer_invoices com invoices; alteração do fluxo de webhook ou do modelo de configuração de gateway.

Com essa ordem, a implantação permanece **compatível** com customer_invoices, integrações atuais, configurações de gateway, arquitetura multi-gateway, webhook, payment_events e status internos, e reduz risco em produção.
