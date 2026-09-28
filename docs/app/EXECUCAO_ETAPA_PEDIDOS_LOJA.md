# EXECUÇÃO — Etapa Pedidos (loja online)

Documento de **plano de execução técnica** apenas (sem implementação).  
Base obrigatória: `docs/app/PLANO_INTEGRACAO_LOJA_PEDIDOS_FATURAS_CHECKOUT.md`.

---

## 1. Objetivo da etapa de Pedidos

### O que esta etapa resolve

- Entregar ao **lojista** uma visão **operacional mínima** dos pedidos originados na loja (incluindo o fluxo já existente de checkout público de 1 item).
- Garantir **rastreabilidade** entre **pedido** (comercial) e **fatura** (financeira), com o painel refletindo de forma confiável o **estado de pagamento** alinhado à fatura vinculada.
- **Ativar o menu “Pedidos”** no grupo “Loja online” somente quando a experiência mínima estiver segura para operação real.

### Por que vem depois do MVP 1 de checkout

- O MVP 1 já cria **pedido + fatura vinculada** e envia o comprador ao pagamento público (`/pay/:token`). Sem a etapa Pedidos, o lojista não tem um lugar **consistente e filtrado pela loja** para acompanhar essas vendas nem um vínculo explícito na UI com a fatura.
- A ordem do plano base (Fase 4 — “Ativação operacional de Pedidos”) coloca **modelagem + checkout** antes da **operação no painel**; esta execução assume Fases 1–2 concluídas e endereça explicitamente a **sincronização financeira** e o **painel**, que o plano base listou na Fase 3–4.

### Por que pedido e fatura continuam separados

- **Pedido** (`orders` / `order_items`): compromisso comercial, itens, cliente de contato, evolução operacional futura (fulfillment).
- **Fatura** (`customer_invoices`): cobrança, gateway, token público, estados `pending` / `paid` / `overdue` / `cancelled`, etc.
- Manter separação evita acoplar logística ao financeiro e reutiliza o pipeline de billing já existente (incl. `CustomerInvoicePay`, webhooks, tentativas de pagamento).

### Ganhos operacionais

- Lojista enxerga **número do pedido, cliente, data, total, status operacional e de pagamento**, e **abre a fatura** quando houver vínculo.
- Reduz suporte interno (“cadê a venda?”) e prepara evoluções sem reabrir decisão de domínio.

---

## 2. Escopo exato desta etapa

### 2.1 Entra nesta fase

- **Sincronização pedido ↔ fatura (financeiro):** quando `customer_invoices.status` (e, se aplicável, `paid_at`) mudar para estados que impliquem pagamento confirmado ou cancelamento, refletir isso em `orders.payment_status` e, conforme política fechada abaixo, em `orders.status`.
- **Ativação do menu Pedidos** em `src/layouts/AppLayout.tsx` (substituir “Pedidos (em breve)” por `NavLink` ativo), alinhado à rota já existente.
- **Ajuste do painel** `src/pages/Orders.tsx` para **visão do lojista**: listar pedidos onde `store_user_id` = usuário logado (dono da loja), não apenas onde o usuário é comprador.
- **Exibir vínculo pedido ↔ fatura:** coluna ou ação “Fatura” com link para `/customer-invoices/:id` (ou equivalente já autenticado no CRM), quando `customer_invoice_id` estiver preenchido.
- **Colunas/status mínimos** (ver secções 5 e 7).
- **Filtros básicos:** busca (número, nome, e-mail) e filtro por status operacional do pedido; opcional nesta fase filtro por `payment_status` se custo baixo.
- **Tipos/API:** alinhar `Order` em `src/types/products.ts` com colunas reais retornadas pela API (`customer_invoice_id`, `client_id` se útil na UI).

### 2.2 Não entra nesta fase

- Logística avançada, expedição, frete, rastreio.
- Carrinho multi-itens, bundles, descontos complexos.
- Automações (e-mail, WhatsApp, Kanban) pós-pagamento.
- Dashboards analíticos avançados.
- Domínio customizado por tenant, integrações externas além do necessário para billing já existente.
- Alteração do fluxo público de checkout (`StorePublicCheckout`, `storePublicCheckoutService`) **salvo** se for estritamente necessário para sincronização (preferir concentrar em billing/webhook/serviço de status).

---

## 3. Diagnóstico técnico (recorte Pedidos)

*Legenda: trechos marcados como **(fato)** vêm do código/repositório atual; **(recomendação)** são decisões propostas para a sprint.*

### 3.1 `orders` (fato)

- Definição base: `database/init/06_create_products.sql` — colunas incluem `order_number`, `store_user_id`, `customer_user_id`, dados do comprador, `total_amount`, `status`, `payment_method`, `payment_status`, timestamps.
- Migrações posteriores:
  - `database/init/101_orders_store_checkout.sql`: `customer_invoice_id` (FK `customer_invoices`), `store_checkout_idempotency_key` (índice único parcial).
  - `database/init/104_orders_client_id.sql`: `client_id` (FK `clients`).
- Checkout público da loja: `packages/backend/src/services/storePublicCheckoutService.ts` insere em `orders` com `client_id`, `customer_invoice_id` preenchido após `createManualCustomerInvoice`, `customer_user_id` NULL, `status`/`payment_status` iniciais `pending`.

### 3.2 `order_items` (fato)

- Estrutura em `06_create_products.sql`; agregação JSON em `packages/backend/src/controllers/ordersController.ts` (`getOrders`, `getOrderById`, `createOrder`).

### 3.3 `customer_invoices` (fato)

- Modelo CRM em `database/init/70_customer_invoices.sql` (evoluções em migrações subsequentes).
- Atualização de status: `packages/backend/src/services/customerInvoiceService.ts` — função `updateCustomerInvoiceStatus` atualiza **apenas** `customer_invoices`, sem referência a `orders`.
- Pagamento público: `packages/backend/src/controllers/publicCustomerInvoicesController.ts`, `packages/backend/src/modules/payments/webhook/paymentDomainService.ts` — fluxos chamam `updateCustomerInvoiceStatus` quando a fatura paga ou muda de estado.

### 3.4 Vínculo pedido ↔ fatura (fato)

- Coluna `orders.customer_invoice_id` existe e é preenchida no fluxo de `createStorePublicCheckout` (vide `storePublicCheckoutService.ts`, `UPDATE orders SET customer_invoice_id = ...`).
- **Gap observado:** não há, no código pesquisado, atualização automática de `orders.payment_status` (nem `orders.status`) quando a fatura associada passa a `paid` ou outro terminal via webhook/sync.

### 3.5 `Orders.tsx` (fato)

- `src/pages/Orders.tsx` chama `cartService.getOrders()` **sem** `storeUserId`.
- `src/services/cart.ts`: `getOrders(storeUserId?)` — sem parâmetro usa `GET /api/orders`, que no backend filtra por `customer_user_id = usuário logado` (`ordersController.getOrders`).
- **Consequência:** a tela atual lista pedidos em que o usuário autenticado é **comprador**, não **lojista**. Pedidos do checkout público (comprador anônimo, `customer_user_id` NULL) **não aparecem** para o dono da loja nesta listagem.

### 3.6 Menu lateral (fato)

- `src/layouts/AppLayout.tsx`: item “Pedidos (em breve)” é um `SidebarMenuButton` **disabled** (linhas ~206–215); não aponta para `/orders`.

### 3.7 Atualização de status de pagamento (fato)

- Fatura: atualizada por webhooks/sync e por rotinas em `updateCustomerInvoiceStatus`.
- Pedido: **não** observada sincronização automática a partir da fatura no serviço de invoice acima.

### 3.8 Rotas e controllers (fato)

- Pedidos autenticados CRM: `packages/backend/src/routes/ordersRoutes.ts` — `tenantAuthCrm`, `GET/POST /api/orders`, `GET /api/orders/:id` → `ordersController.ts`.
- Checkout público (criação pedido+fatura): `packages/backend/src/routes/storeCheckoutRoutes.ts`, `storeCheckoutController.ts`, serviço `storePublicCheckoutService.ts`.
- Faturas CRM (painel): `src/App.tsx` — `/customer-invoices`, `/customer-invoices/:id` (`CustomerInvoices`, `CustomerInvoiceDetail`).

### 3.9 Limitações atuais (resumo)

- Painel `Orders` não é visão lojista sem passar `storeUserId`.
- `payment_status` do pedido pode ficar **desalinhado** da fatura após pagamento.
- Tipo `Order` no frontend não declara `customer_invoice_id` / `client_id` (apesar das colunas no banco).
- Botões “Ver Detalhes” / “Processar Pedido” em `Orders.tsx` podem estar **sem rota/ação** real (verificar na sprint ao implementar).

---

## 4. Decisões técnicas da etapa

### 4.1 Como o pedido reflete o status da fatura (recomendação)

- **Fonte de verdade financeira:** `customer_invoices.status` (e `paid_at` quando `paid`).
- **Espelho no pedido:**
  - `orders.payment_status`: mapear `paid` ↔ fatura `paid`; `pending`/`waiting_payment`/`processing` (se existirem no gateway) ↔ `pending`; `failed` se política definir (ex. cancelamento de cobrança sem pagamento); `cancelled` na fatura ↔ alinhar pedido (ver5).
- **Status operacional `orders.status`:** **(recomendação)** ao confirmar pagamento (`customer_invoices.status = paid`), atualizar `orders.status` de `pending` para `processing` (preparo mínimo), mantendo `completed` para encerramento manual futuro ou fase posterior.

### 4.2 Onde sincronizar (recomendação)

- **Centralizar** em um único caminho chamado sempre que a fatura mudar para estado relevante:
  - Opção A (preferível): estender ou envolver `updateCustomerInvoiceStatus` (ou camada imediatamente acima usada por webhook e por `publicCustomerInvoicesController`) para, após `UPDATE customer_invoices`, executar `UPDATE orders SET payment_status = ..., status = ..., updated_at = now() WHERE customer_invoice_id = $invoiceId`.
  - Opção B: serviço dedicado `syncOrderPaymentFromInvoice(invoiceId)` invocado dos mesmos pontos.
- **Evitar** duplicar lógica só no frontend; o painel deve **ler** o que o backend persistir.

### 4.3 Status mínimos do pedido nesta fase (recomendação)

- Manter enum já usado na UI: `pending`, `processing`, `completed`, `cancelled`.
- Transição automática nesta etapa: `pending` → `processing` quando fatura `paid` (opcional na sprint: manter `pending` até ação manual — decidir explicitamente no Passo 1; o plano base sugeria `processing` após pagamento).

### 4.4 Colunas mínimas do painel (recomendação)

- `order_number`, `customer_name`, `customer_email`, `created_at`, `total_amount`, `status`, `payment_status`, indicador/link **fatura** (`customer_invoice_id`).

### 4.5 Menu Pedidos (recomendação)

- Ativar quando: listagem lojista + vínculo fatura visível + sincronização de pagamento **implementada e testada** (ou feature flag “pronto para operação mínima”).
- Rota inicial: **`/orders`** (já existente em `App.tsx`), alinhado ao plano base.

### 4.6 Fatura vinculada na UI (recomendação)

- Link “Abrir fatura” → `/customer-invoices/:customer_invoice_id` (autenticado), desde que o `tenantAuthCrm` e políticas atuais permitam acesso ao tenant da fatura.

### 4.7 Compatibilidade (recomendação)

- Não remover `GET /api/orders` sem `storeUserId`: compradores autenticados que usam carrinho legado podem continuar usando o filtro por `customer_user_id`.
- Adicionar uso explícito de `GET /api/orders?storeUserId=<id do lojista>` no painel quando `userId` for o dono da loja (id do JWT = `store_user_id` dos pedidos da própria loja).

---

## 5. Modelo operacional mínimo

| Dimensão | Mínimo |
|----------|--------|
| Status do pedido | `pending` (criado), `processing` (pago / em atendimento), `completed` / `cancelled` conforme ações futuras ou manuais |
| Pagamento visível | `payment_status`: pelo menos **Pendente** vs **Pago**, alinhado à fatura |
| Lojista precisa ver | Lista filtrada pela **sua** loja, total, cliente, data, status, link da fatura |
| MVP operacional | Confiar que “pago na fatura” = “pago no pedido” sem exigir troca manual de método na UI pública |

---

## 6. Fluxo operacional esperado

1. Compra no checkout público gera **pedido** + **fatura** com vínculo (`customer_invoice_id`).
2. Fatura fica **pendente** até pagamento no fluxo `/pay/:token`.
3. Pagamento é realizado (PIX/boleto/cartão conforme gateway).
4. Gateway/webhook ou sync atualiza **`customer_invoices.status`** (ex.: `paid`).
5. **(Novo)** Rotina de sincronização atualiza **`orders.payment_status`** (e opcionalmente `orders.status`).
6. Lojista abre **Pedidos**, vê pedido com pagamento **Pago** (ou equivalente).
7. Lojista clica no **link da fatura** e confere detalhes em **Faturas do cliente**.

---

## 7. Painel de Pedidos (`Orders.tsx`)

### 7.1 Evolução desejada

- Passar a carregar pedidos com **`cartService.getOrders(currentUserId)`** ou equivalente onde `currentUserId` seja o **dono da loja** (o mesmo `user_id` de `store_profiles` / produtos). **(fato)** hoje `getOrders()` sem argumento não faz isso.
- Incluir colunas: número, cliente (nome + e-mail), data, total, status do pedido, status de pagamento, **fatura vinculada** (badge + link).
- **Ações mínimas:** abrir detalhe do pedido (drawer/página) com itens e contato; link para fatura; opcional “copiar link público de pagamento” se existir `payment_token` exposto com segurança (avaliar na implementação — pode ficar só na tela de fatura).

### 7.2 Filtros

- Manter busca textual e filtro por `status` operacional; **(recomendação)** adicionar filtro por `payment_status` (Todos / Pendente / Pago).

### 7.3 Pedidos sem operação complexa

- Não exigir etapas de envio; foco em leitura e vínculo financeiro.

---

## 8. Menu Pedidos

### 8.1 Quando sair de “em breve” (recomendação)

- Quando os **Passos 1–3** (sincronização + API/listagem lojista + UI mínima) estiverem implementados e validados nos testes da secção 12.

### 8.2 Rota inicial (fato)

- `/orders` já registrada em `src/App.tsx` com `AuthGuard` e `AppLayout`.

### 8.3 Garantia de qualidade (recomendação)

- Checklist antes de ativar o menu: pedido de checkout público visível para lojista; após pagamento de teste, `payment_status` coerente; link para fatura funciona; sem regressão no checkout MVP1.

---

## 9. Plano de execução em passos

### Passo 1 — Consolidar sincronização pedido ↔ fatura

| Item | Conteúdo |
|------|----------|
| **Arquivos afetados (provável)** | `packages/backend/src/services/customerInvoiceService.ts` (`updateCustomerInvoiceStatus` ou chamadores), `packages/backend/src/modules/payments/webhook/paymentDomainService.ts`, `packages/backend/src/controllers/publicCustomerInvoicesController.ts` (sync de status), eventualmente novo `packages/backend/src/services/orderInvoiceSyncService.ts` |
| **Ações** | Definir mapa fatura → pedido; após transição relevante da fatura, atualizar `orders` por `customer_invoice_id`; garantir idempotência (múltiplos webhooks); log mínimo |
| **Dependências** | Migrações `101`/`104` aplicadas em todos os ambientes |
| **Risco** | Webhook duplicado; race com checkout — mitigar com UPDATE condicional e testes |

### Passo 2 — Ajustar leitura operacional dos pedidos (API + segurança)

| Item | Conteúdo |
|------|----------|
| **Arquivos afetados** | `packages/backend/src/controllers/ordersController.ts` (`getOrders`, `getOrderById`), possivelmente testes |
| **Ações** | Garantir que `storeUserId` na query string corresponda ao tenant/usuário autorizado (lojista só lista próprios `store_user_id`); revisar `getOrderById` para dono da loja acessar pedido por `store_user_id` |
| **Dependências** | Passo 1 opcionalmente em paralelo, mas testes E2E precisam dos dois |
| **Risco** | Vazamento cross-tenant — validar sempre com `tenant_id` do JWT |

### Passo 3 — Evoluir `Orders.tsx` para visão do lojista

| Item | Conteúdo |
|------|----------|
| **Arquivos afetados** | `src/pages/Orders.tsx`, `src/services/cart.ts`, `src/types/products.ts`, possivelmente hook de auth (`useAuth` ou equivalente) para obter `user.id` |
| **Ações** | Chamar `getOrders(userId)`; novas colunas; link para `/customer-invoices/:id`; filtros de pagamento; alinhar labels com estados reais da fatura quando útil |
| **Dependências** | Passo 2 |
| **Risco** | Usuário sem loja (sem `store_user_id` relevante) — definir empty state |

### Passo 4 — Ativar menu Pedidos

| Item | Conteúdo |
|------|----------|
| **Arquivos afetados** | `src/layouts/AppLayout.tsx` |
| **Ações** | Substituir botão desabilitado por `NavLink to="/orders"` com mesmo padrão visual dos outros itens; opcional `routePreload.orders` se existir padrão |
| **Dependências** | Passos 3 e1 concluídos (ou flag “habilitar menu”) |
| **Risco** | Ativar cedo — lojista vê dados errados ou pagamento não atualizado |

### Passo 5 — Validação final e rollout

| Item | Conteúdo |
|------|----------|
| **Arquivos afetados** | Testes em `packages/backend` (se houver vitest para serviços), checklist manual |
| **Ações** | Executar bateria secção 12; staging; decidir feature flag (ver 13) |
| **Dependências** | Passos 1–4 |
| **Risco** | Produção com webhooks Asaas diferentes de sandbox |

---

## 10. Arquivos impactados (lista objetiva)

### Frontend

| Arquivo | Motivo | Tipo de mudança esperada |
|---------|--------|---------------------------|
| `src/pages/Orders.tsx` | Visão lojista, colunas, fatura, filtros | Lógica + UI |
| `src/services/cart.ts` | Passar `storeUserId` na listagem | Parâmetro obrigatório ou default derivado do usuário |
| `src/types/products.ts` | Paridade com API | Estender `Order` |
| `src/layouts/AppLayout.tsx` | Menu Pedidos | Habilitar `NavLink` |

### Backend

| Arquivo | Motivo | Tipo de mudança esperada |
|---------|--------|---------------------------|
| `packages/backend/src/services/customerInvoiceService.ts` | Hook pós-atualização fatura | Chamada a sync pedido ou lógica encapsulada |
| `packages/backend/src/modules/payments/webhook/paymentDomainService.ts` | Webhook altera fatura | Garantir sync pedido |
| `packages/backend/src/controllers/publicCustomerInvoicesController.ts` | Sync ao marcar paga | Garantir sync pedido |
| `packages/backend/src/controllers/ordersController.ts` | Autorização listagem/detalhe lojista | Refinar `getOrders` / `getOrderById` |
| Possível **novo** serviço `orderInvoiceSyncService.ts` | Centralizar regra | CREATE |

### Banco / modelagem

| Artefato | Motivo |
|----------|--------|
| **Nenhuma migração obrigatória** para o escopo mínimo, **se** `customer_invoice_id` já existir (fato: `101_orders_store_checkout.sql`). Opcional: índice composto ou view materializada (fora do mínimo). |

### Testes

| Área | Motivo |
|------|--------|
| `packages/backend` | Testes unitários do mapa status fatura → pedido |
| Manual / E2E | Fluxo checkout → pay → pedido lojista |

---

## 11. Compatibilidade e riscos

### O que continua funcionando (expectativa)

- Checkout público `POST /api/store-checkout/create` e redirecionamento `/pay/:token`.
- Criação de pedidos via `POST /api/orders` autenticada (carrinho) — desde que `getOrders` sem query continue atendendo comprador.

### Evitar quebra do checkout

- Não alterar contrato de `storePublicCheckoutService` salvo necessidade; sincronização deve ser **reativa** à mudança de fatura.

### Evitar inconsistência pedido × fatura

- Uma única função de sync; operações idempotentes; considerar transação apenas se atualizar duas tabelas no mesmo request (avaliar deadlocks).

### Produção estável

- Deploy com migrações já aplicadas; monitorar logs de webhook após release.

### Riscos de ativar o menu cedo

- Lojista não vê pedidos de vitrine ou vê pagamento “Pendente” após cliente já ter pago — perda de confiança.

---

## 12. Testes da etapa

### 12.1 Backend- Vínculo: pedido criado com `customer_invoice_id` não nulo após checkout (já existente).
- Ao simular `updateCustomerInvoiceStatus(..., 'paid', ...)`, `orders.payment_status` e `orders.status` atualizados conforme política.
- `GET /api/orders?storeUserId=<lojista>` retorna apenas pedidos da loja; outro tenant não acessa.
- `GET /api/orders/:id` para lojista dono do `store_user_id`.

### 12.2 Frontend

- Painel lista pedidos da loja após checkout.
- Link abre fatura correta.
- Filtros não quebram lista vazia.
- Menu Pedidos navega para `/orders`.

### 12.3 Testes manuais

- Pedido pendente de pagamento; após pagar, pedido mostra pago.
- Pedido cancelado na fatura (se aplicável) reflete no pedido.
- Loja com vários pedidos; loja sem pedidos (empty state).
- Regressão: fluxo carrinho autenticado (se ainda usado) continua listando para comprador quando não passar `storeUserId`.

---

## 13. Rollout e mitigação

- **Feature flag (recomendação):** opcional `VITE_ENABLE_STORE_ORDERS_MENU` / backend espelho — permite ativar menu só após homologação.
- **Staging:** fluxo completo com Asaas sandbox; verificar webhook chegando ao backend.
- **Canário:** habilitar menu para um tenant interno.
- **Reverter:** desabilitar item no `AppLayout`; sync no backend pode permanecer (não piora UX) ou ser protegido por flag.
- **Produção:** ligar menu quando critérios da secção 14 atendidos.

---

## 14. Critérios de aceite

- [ ] Pedido reflete status financeiro da fatura vinculada após pagamento (e cenários de falha/cancelamento definidos).
- [ ] Painel exibe colunas mínimas (secção 7).
- [ ] Lojista vê pedidos da **própria** loja (`store_user_id`).
- [ ] Fatura vinculada é rastreável via link a partir do pedido.
- [ ] Menu “Pedidos” ativo aponta para `/orders` e só é ligado quando aceite operacional estiver OK.
- [ ] Checkout MVP 1 (1 item, público) continua criando pedido + fatura e redirecionando ao pagamento.
- [ ] Não há regressão documentada em `GET /api/orders` para comprador autenticado (modo legado).

---

## 15. Pendências para a fase seguinte

- Logística, frete, expedição, SLA.
- Automações pós-venda e integrações de terceiros.
- Dashboard de vendas avançado.
- Carrinho multi-itens e checkout avançado.
- Fulfillment (separado, enviado, entregue) com estados ricos no pedido.
- Notificações ao comprador a partir do pedido.

---

*Fim do documento de execução — etapa Pedidos (loja online).*
