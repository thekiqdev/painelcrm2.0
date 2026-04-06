# Plano de evolução — Faturas de clientes, Financeiro e Cobrança

**Objetivo:** Estruturar a evolução do sistema de faturas e do módulo financeiro com base na estrutura atual e nas ideias propostas. Este documento é um **plano de ação e análise**, não implementação.

---

## 1. Estado atual (resumo)

### 1.1 Menus e páginas

| Menu (sidebar) | Rota | Conteúdo atual | Observação |
|----------------|------|----------------|------------|
| **Faturamento** | `/billing` | Página placeholder: "Sistema de Faturamento – Em breve" | Sem funcionalidade real; botão "Nova Fatura" sem ação útil. |
| **Faturas de clientes** | `/customer-invoices` | Listagem + modal em 2 passos (pré-requisitos → dados da cobrança), integração Asaas | Fluxo que gera cobrança no gateway e registra em `customer_invoices`. |
| **Financeiro** | `/finance` | Abas: Resumo financeiro, Faturas, Despesas; usa `/api/invoices` e `/api/expenses` | Faturas = tabela `invoices` (itens JSONB, sem gateway); Despesas = tabela `expenses`. |

Conclusão: há **dois sistemas de fatura** distintos:
- **customer_invoices** (Asaas): faturas manuais/recorrentes do tenant para seus clientes, com cobrança real no gateway.
- **invoices** (finance): faturas internas com itens (JSONB), sem gateway, usadas no relatório financeiro.

### 1.2 Banco de dados relevante

- **customer_invoices:** tenant_id, client_id, subscription_id (nullable), amount_cents, due_date, status, gateway, asaas_payment_id, origin, invoice_type, description, payment_method, etc. **Sem itens por linha**; valor único por fatura.
- **invoices:** user_id, client_id, project_id, invoice_number, issue_date, due_date, status, **items (JSONB)**, total, notes. Usado pelo Finance.
- **expenses:** user_id, project_id, description, amount, date, category, is_paid, notes.
- **products:** id, user_id, name, description, **type IN ('product', 'service')**, price, category, status, etc. Já existe produto/serviço.

### 1.3 Integração Asaas (atual)

- **Criar cobrança:** POST /payments (customer, billingType, value, dueDate, description, externalReference).
- **Consultar:** GET /payments/:id, GET /payments/:id/pixQrCode.
- **Não implementado:** DELETE /payments/:id (excluir/cancelar no Asaas); parâmetro para desativar notificações (ex.: `notificationEnabled: false` no body do POST, conforme documentação Asaas).

---

## 2. Ponto 1 — Menus e “Financeiro completo”

### 2.1 Problema

- Três itens na área “Financeiro”: Faturamento (placeholder), Faturas de clientes (funcional), Financeiro (faturas + despesas internas).
- Redundância de nomes e possível confusão: “Faturamento” vazio vs “Faturas de clientes” vs “Financeiro”.

### 2.2 Proposta de simplificação

- **Unificar sob um único bloco “Financeiro”** com sub-itens ou uma única página com abas:
  - **Faturas (cobrança)** → lista e criação das faturas que geram cobrança (customer_invoices + Asaas). Pode ser a evolução da atual “Faturas de clientes”.
  - **Relatório financeiro** → visão unificada: faturas (receitas) + despesas; gráficos e totais (evolução da atual página Finance).
- **Remover** o item “Faturamento” que leva à página placeholder ou **redirecionar** “Faturamento” para a mesma página de Faturas (cobrança), evitando duas entradas para a mesma função.

Opções de estrutura:

- **Opção A – Um item “Financeiro” com abas internas**  
  - Rota única ex.: `/finance` (ou `/financeiro`).  
  - Abas: Faturas (cobrança) | Despesas | Relatório (resumo faturas + despesas).  
  - Sub-rota para criar fatura: `/finance/invoices/new` (página única de criação, não popup).

- **Opção B – Dois itens no menu**  
  - “Faturas” → `/customer-invoices` (lista) + `/customer-invoices/new` (criação).  
  - “Financeiro” → `/finance` (despesas + relatório; opcionalmente incluir resumo de faturas recebidas).

Recomendação: **Opção A** (um módulo Financeiro com abas) para menos redundância e um único lugar para “sistema financeiro completo”.

### 2.3 Plano de ação (menu e relatório)

1. Definir estrutura final do menu (A ou B) e rotas.
2. Eliminar ou redirecionar a página “Faturamento” (`/billing`).
3. Na tela de relatório financeiro: garantir que “receitas” considerem **customer_invoices** (pagas) e, se desejado, **invoices** (pagas) para um resumo unificado; despesas continuam em **expenses**.
4. Ajustar `AppLayout`, `RequireModuleView` e feature flags (ex.: `invoices` / `expenses`) conforme a estrutura escolhida.

---

## 3. Ponto 2 — Faturas de clientes mais robustas

### 3.1 Fluxo atual

- Modal em 2 passos: (1) Pré-requisitos (cliente, checklist CPF + gateway); (2) Valor, data, descrição, forma de pagamento.
- Criação envia um único valor ao Asaas (sem itens, sem descontos por linha).
- Não há página de pagamento com link único; não há itens nem produtos/serviços na fatura.

### 3.2 Melhorias desejadas (resumo)

- Página única de criação (não popup).
- Fatura recorrente (gerar futuras faturas automaticamente).
- Itens na fatura (como orçamento): descrição, quantidade, valor, descontos; opção de vincular produtos/serviços cadastrados.
- Escolha de forma(s) de pagamento (PIX, cartão, boleto) na fatura.
- Aviso no topo da página + atalho para configurar Asaas (em vez de popup de check).
- Ao selecionar cliente: exibir dados; se não tiver CPF, permitir preencher e salvar no perfil.
- Página de pagamento com **link único**: itens, totais e seleção de forma de pagamento.
- Fatura para “não cliente”: link único exige primeiro preenchimento (nome, telefone, CPF/CNPJ com máscara e validação); depois criar cliente e vincular à fatura.
- Sincronizar com Asaas: ao excluir/cancelar fatura no sistema, excluir/cancelar no Asaas.
- Desativar notificações de faturas do Asaas (ex.: `notificationEnabled: false` no create payment).

### 3.3 Análise técnica e dependências

#### 3.3.1 Itens na fatura (customer_invoices)

- Hoje **customer_invoices** tem um único valor (`amount_cents`); não há tabela de itens.
- Para itens com descontos e produtos/serviços é necessário:
  - Nova tabela **customer_invoice_items** (invoice_id, product_id opcional, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order) **ou**
  - Campo **items** JSONB em **customer_invoices** (similar a `invoices.items`).
- Vantagem de tabela normalizada: consultas, relatórios e integração com produtos; vantagem de JSONB: menos migrations e flexibilidade. Recomendação: **tabela customer_invoice_items** para consistência e reuso de produtos.

#### 3.3.2 Produtos e serviços

- Tabela **products** já existe com `type IN ('product', 'service')`, price, etc.
- Na criação da fatura: listar produtos/serviços do tenant (por user_id ou tenant via users); permitir adicionar linha “livre” (sem product_id) ou “do catálogo” (com product_id e preço vindo do produto, editável).

#### 3.3.3 Formas de pagamento na fatura

- Asaas: uma cobrança = um `billingType` (PIX, BOLETO, CREDIT_CARD ou UNDEFINED). Para “deixar disponível ao acessar o pagamento”:
  - **Opção 1:** Criar no Asaas com `billingType: 'UNDEFINED'` (se disponível) para o cliente escolher depois no link.
  - **Opção 2:** Manter um tipo por cobrança; na **página de pagamento (link único)** mostrar as opções disponíveis e criar uma cobrança por tipo se o usuário escolher (ex.: “Pagar com PIX” gera uma cobrança PIX).
- Verificar na documentação Asaas se há “payment link” com escolha de método; o plano atual pode assumir uma cobrança por método ou uso de UNDEFINED se suportado.

#### 3.3.4 Fatura recorrente (automática)

- Já existe **subscriptions** + Billing Engine para recorrência (type=customer).
- “Marcar como fatura recorrente” pode significar: (a) criar uma **subscription** vinculada ao cliente e ao “template” da fatura (valor/itens, periodicidade), e o worker gera **customer_invoices** automaticamente; ou (b) apenas um agendamento interno (tabela de “faturas programadas”) que cria uma fatura manual por período.
- Recomendação: reutilizar **subscriptions** (type=customer) com plano/valor definido; na UI “Nova fatura” permitir opção “Recorrente” e, ao salvar, criar subscription + primeira fatura (ou só subscription e o worker gera a primeira).

#### 3.3.5 Link único de pagamento

- Cada fatura pode ter um **token público** (UUID ou slug) que não seja o id interno; rota ex.: `/pay/:token` (ou `/fatura/:token`).
- Backend: GET público (ou com token na query) que retorna fatura (itens, total, cliente, status) e, se pendente, permite escolher forma de pagamento e redirecionar para Asaas (invoiceUrl, bankSlipUrl, pix) ou exibir QR PIX.
- Segurança: token não sequencial e não adivinhável; não expor dados sensíveis além do necessário ao pagamento.

#### 3.3.6 Fatura sem cliente (não cliente)

- **customer_invoices** hoje tem `client_id` NOT NULL. Seria necessário:
  - Tornar **client_id** nullable **ou**
  - Criar um “cliente anônimo” por tenant (ex.: “Aguardando cadastro”) e, ao preencher o formulário no link, criar o cliente real e atualizar a fatura com esse client_id.
- Recomendação: **client_id nullable** para faturas “por link”; ao preencher nome/telefone/CPF no link, criar cliente e atualizar `customer_invoices.client_id`. Exige migration e ajuste em constraints (ex.: FK opcional).

#### 3.3.7 Sincronização com Asaas (excluir / cancelar)

- Ao **excluir** ou **cancelar** fatura no sistema:
  - Chamar **DELETE /v3/payments/{asaas_payment_id}** no Asaas (se existir asaas_payment_id e se o status no Asaas permitir exclusão).
  - Documentação Asaas: DELETE para remover cobrança.
- Tratar casos: cobrança já paga no Asaas (não permitir excluir no sistema ou apenas “arquivar” sem chamar delete); cobrança já cancelada no Asaas (idempotência).

#### 3.3.8 Notificações Asaas desativadas

- Na criação do pagamento (POST /payments), incluir no body o parâmetro que desativa notificações (ex.: **notificationEnabled: false**; confirmar nome exato na documentação Asaas).
- Atualizar **AsaasPaymentRequest** e o mapper/request no backend para enviar esse campo.

### 3.4 Ordem sugerida de implementação (faturas)

| Fase | Escopo | Dependências |
|------|--------|--------------|
| **2.1** | Aviso no topo + atalho Asaas; trocar popup de check por isso; página única de criação (rota `/customer-invoices/new`) com os campos atuais (valor, data, descrição, forma de pagamento) | Nenhuma |
| **2.2** | Ao selecionar cliente: exibir dados; edição de CPF na própria tela e salvar no perfil | Backend já suporta CPF; só UX |
| **2.3** | Itens na fatura: migration (customer_invoice_items ou items JSONB); backend e tela de criação com linhas (descrição, qtd, valor, desconto); total calculado | Define modelo de dados |
| **2.4** | Produtos/serviços: listar produtos do tenant na criação; adicionar linha a partir do catálogo (preço sugerido, editável) | 2.3 |
| **2.5** | Link único de pagamento: token na fatura, rota pública GET/POST, página com itens e totais e seleção de pagamento (PIX/boleto/cartão) | 2.3 |
| **2.6** | Fatura recorrente: opção na criação; criar subscription (type=customer) ou “agendamento”; worker já gera customer_invoices | Billing Engine existente |
| **2.7** | Fatura sem cliente: client_id nullable; formulário no link para preencher dados e criar cliente + vincular fatura | Migration + 2.5 |
| **2.8** | Sync Asaas: ao cancelar/excluir fatura, chamar DELETE no Asaas; notificationEnabled: false na criação | asaasClient + tipos |

---

## 4. Ponto 3 — Cobrança (conceito e modelo)

### 4.1 Ideia em palavras

- **Cobrança** = um “acordo” ou “conta” com valor total (ex.: R$ 10.000).
- O cliente vai “abatendo” esse valor com **várias faturas** (parcelas ou pagamentos parciais).
- Exemplo: Cobrança de R$ 10.000 → Fatura 1 (R$ 3.000) → Fatura 2 (R$ 4.000) → Fatura 3 (R$ 3.000). Quando a soma das faturas pagas = valor da cobrança, a cobrança fica “quitada”.

### 4.2 Modelo de dados proposto

- Nova entidade **charges** (ou **customer_charges**):
  - id, tenant_id, client_id (opcional, se “cobrança para não cliente”),
  - total_amount_cents (valor total a ser abatido),
  - status (open | partial | paid | cancelled),
  - due_date opcional (prazo geral),
  - description,
  - created_at, updated_at.
- **customer_invoices** ganha **charge_id** (nullable): quando preenchido, a fatura “conta” para essa cobrança.
- Cálculo: `paid_amount = SUM(amount_cents) das customer_invoices WHERE charge_id = X AND status = 'paid'`; quando `paid_amount >= total_amount_cents`, status da cobrança = paid.

### 4.3 Fluxo

- Criar “Cobrança” (valor total, cliente, descrição); status open.
- Na criação de “Fatura”, opção “Vincular a uma cobrança” (select de cobranças abertas do cliente); ao criar a fatura, preenche charge_id.
- Dashboard/relatório: por cobrança, listar faturas vinculadas e valor já pago; permitir marcar cobrança como quitada manualmente se necessário (ou só por regra automática).

### 4.4 Alternativa mais simples (sem nova tabela)

- Não criar tabela **charges**; usar apenas **customer_invoices** com um “grupo”:
  - Ex.: campo **charge_group_id** (UUID) ou **charge_reference** (texto). Todas as faturas com o mesmo charge_group_id pertencem à mesma “cobrança”.
  - Valor total da “cobrança” = soma dos amount_cents das faturas do grupo (definido na criação do grupo ou na primeira fatura). Quitado quando soma dos pagos >= total.
- Desvantagem: o “valor total” da cobrança fica implícito (soma dos itens) ou precisa ser guardado em outro lugar (ex.: primeira fatura com metadata “charge_total”).

Recomendação: **tabela customer_charges** explícita (total_amount_cents, status) e **customer_invoices.charge_id** FK para charges. Relatórios e regras ficam claros.

### 4.5 Plano de ação (Cobrança)

1. **Fase 3.1** – Migration: criar **customer_charges**; adicionar **charge_id** em **customer_invoices** (nullable, FK para customer_charges).
2. **Fase 3.2** – Backend: CRUD de cobranças (create, list, getById, update status); ao listar cobrança, retornar faturas vinculadas e valor pago.
3. **Fase 3.3** – Frontend: tela “Cobranças” (lista); criação de cobrança (valor total, cliente, descrição); na criação de fatura, opção “Vincular à cobrança X”.
4. **Fase 3.4** – Regra: ao marcar fatura como paga (webhook ou manual), recalcular soma das faturas da cobrança e atualizar status da cobrança para partial ou paid.

---

## 5. Resumo da ordem de implementação sugerida

1. **Menu e relatório (Ponto 1)**  
   - Unificar menu Financeiro; remover/redirecionar “Faturamento”; relatório com faturas (customer_invoices) + despesas.

2. **Faturas robustas – parte 1 (Ponto 2)**  
   - Página única de criação; aviso no topo + link Asaas; dados do cliente e CPF na tela; itens na fatura (tabela ou JSONB); produtos/serviços; link único de pagamento.

3. **Faturas robustas – parte 2**  
   - Recorrente (subscription); fatura sem cliente (client_id nullable + formulário no link); sync Asaas (delete/cancel + notificationEnabled).

4. **Cobrança (Ponto 3)**  
   - Tabela customer_charges; charge_id em customer_invoices; CRUD e regra de “quitado”.

---

## 6. Checklist de decisões antes de codar

- [ ] Estrutura de menu: Opção A (um Financeiro com abas) ou B (Faturas + Financeiro separados)?
- [ ] Itens da fatura: tabela **customer_invoice_items** ou campo **items** JSONB em customer_invoices?
- [ ] Fatura sem cliente: **client_id** nullable em customer_invoices?
- [ ] Cobrança: confirmar modelo com tabela **customer_charges** e **charge_id** em customer_invoices.
- [ ] Confirmar na documentação Asaas: nome exato do parâmetro de notificação (notificationEnabled vs notificationDisabled) e comportamento do DELETE /payments/:id.

Com essas decisões fechadas, o plano pode ser quebrado em tarefas técnicas (migrations, endpoints, telas) e implementado por fases.
