# Investigação: fatura única da plataforma (SaaS / `tenant_billing`)

**Data:** 2026-04-24  
**Escopo:** investigação e proposta — **sem implementação** nesta etapa.  
**Objetivo:** permitir que cobranças geradas no checkout continuem sendo **uma única** linha em `tenant_billing`, com **link próprio** da plataforma (em vez do URL bruto do Asaas como experiência principal) e **visibilidade** para o Super Admin.

---

## 1. Diagnóstico — entidade real da cobrança da plataforma

### 1.1 Entidade canónica

A cobrança comercial da plataforma (plano do tenant, upgrade, renovação, cobrança manual Super Admin, seat addon) está modelada na tabela **`tenant_billing`**.

- **Uma linha** = uma fatura/cobrança “pai” no domínio SaaS.
- Tentativas técnicas por método (PIX/boleto/cartão) ficam em **`tenant_billing_payment_attempts`** (quando a tabela existe no ambiente); o hub comercial do cliente lista apenas o “pai”, não as tentativas.

Referência de agregação no hub do tenant:

- Serviço `commercialTenantBillingsHubService.ts` — `listCommercialBillingsForHub(tenantId)` filtra `billing_reason` em `plan_purchase`, `plan_upgrade`, `plan_renewal`, `manual_charge`, `seat_addon`.

Não há hoje uma tabela “agregadora” paralela obrigatória: o **`tenant_id`** em `tenant_billing` liga a cobrança ao tenant; **`plan_id`**, snapshots (`plan_name_snapshot`, etc.) e **`subscription_id`** (quando recorrente) completam o contexto.

### 1.2 Relação com checkout, billing e pagamento

Fluxo típico de **checkout de plano** (`POST /api/plan-purchase`):

1. `planPurchaseController` chama **`subscribePlan`** (`subscriptionService.ts`).
2. **`subscribePlan`** valida plano, calcula valor, obtém ou reutiliza fatura (`findReusableSaasPlanCheckoutInvoice`), eventualmente **`createInvoice`** (`invoiceService.ts` → `INSERT` em `tenant_billing`).
3. Com gateway ativo, cria/atualiza cobrança no Asaas (ou outro), persiste **`gateway_reference_id`**, **`gateway_metadata`**, **`gateway_status`**, **`payment_method`**, etc.
4. Resposta ao cliente inclui URLs de pagamento (invoice/boleto/PIX) e, quando aplicável, **`inline_pay_token`** via **`ensureTenantBillingInlinePayToken`** — token guardado em **`gateway_metadata.checkout_inline_pay_token`**.

Ativação após pagamento continua a passar por **`activatePlanFromBilling`**, webhooks / polling e serviços já existentes — **não** é necessário duplicar cobrança no gateway para apenas “mostrar” uma página própria.

---

## 2. Onde a cobrança nasce hoje (pontos de criação)

| Origem | Caminho principal | Observação |
|--------|-------------------|------------|
| Checkout self-service | `planPurchaseController` → `subscribePlan` | Fluxo principal de plano pago / contexto comercial |
| Super Admin “gerar cobrança” | `tenantsController.createTenantCharge` | `INSERT tenant_billing` + gateway; dispara `platform.billing.charge.created` |
| Jobs de recorrência / assinatura | `subscriptionService` / `recurringBillingJobService` | Novas linhas `tenant_billing` por ciclo conforme regras atuais |

A investigação do “plano grátis” vs pago: plano **grátis** pode não gerar `tenant_billing` com cobrança Asaas; o foco deste documento é onde **há** cobrança de gateway e link de pagamento — ou seja, **`tenant_billing`** com metadata de pagamento.

---

## 3. O que é persistido hoje (valor, vencimento, link, referências)

Campos relevantes em **`tenant_billing`** (ver `TenantBillingRow` em `invoiceService.ts`):

- **Valor:** `amount_cents`
- **Vencimento:** `due_date`
- **Status:** `status` (`pending` | `paid` | `overdue` | `cancelled`, etc.)
- **Número exibível:** `invoice_number`
- **Gateway:** `gateway`, `payment_method`, `gateway_reference_id`, `gateway_status`
- **Metadados (inclui links Asaas):** `gateway_metadata` — JSON com chaves usadas pelo produto, por exemplo `invoiceUrl`, `bankSlipUrl`, `pixCopyPaste`, `pixQrCode`, `checkout_inline_pay_token`, etc.

O **payment_link** usado nas notificações **não** é uma coluna dedicada: é **derivado** em tempo de envio.

---

## 4. Motor de notificações da plataforma — comportamento atual

Arquivo: `platformBusinessNotifications.ts`.

### 4.1 `platform.billing.charge.created`

- Carrega a linha com **`getInvoiceById(billingId)`**.
- Monta `mergeContext`, incluindo **`billing.payment_link`** via **`pickPaymentLinkFromBilling(row)`**:
  - Ordem de preferência: `invoiceUrl` → `pixCopyPaste` → `bankSlipUrl` → `pixQrCode` (primeira string não vazia em `gateway_metadata`).
- Efeito: o WhatsApp recebe **URL ou payload bruto do gateway** (domínio Asaas ou similar), não uma rota da aplicação.

### 4.2 `platform.billing.payment_confirmed`

- Usa dados da mesma entidade `tenant_billing` após pagamento; **não** depende do `payment_link` no template padrão (foco em confirmação).

### 4.3 Conclusão

Qualquer mudança de UX para “link da plataforma” exige **ou** novo merge field (ex.: `billing.platform_pay_url`) **ou** alteração de `pickPaymentLinkFromBilling` / template — **explicitamente fora do escopo desta rodada de implementação**, conforme pedido; aqui apenas registra-se o acoplamento atual ao metadata do gateway.

---

## 5. Páginas / rotas existentes reaproveitáveis

### 5.1 Checkout comercial público

- **`/checkout`** — `PlanCheckout.tsx`: fluxo completo (plano, empresa, admin, pagamento). Suporta estado para focar cobrança (`focusBillingId` via `location.state`) em cenários vindos do hub — útil para **logged-in**, não resolve sozinho link “mágico” WhatsApp sem autenticação.

### 5.2 Pagamento SaaS autenticado (fatura já existente)

- **`/saas-billing/:billingId/pay`** — `InternalBillingCheckout.tsx`, protegido por **`AuthGuard`**.
- Usa `billingId` na URL, mas **exige login** como administrador principal (mesma regra de “commerce gate” que `/meu-plano`).
- **Não** serve como substituto direto do link Asaas para um utilizador que só abre o WhatsApp sem sessão.

### 5.3 Página pública de outro domínio (padrão token)

- **`/pay/:token`** — `CustomerInvoicePay`: paga **faturas CRM** (`customer_invoices`), **não** `tenant_billing`.
- Há **precedente arquitetural** na base: rota pública + token opaco + API dedicada — útil como **modelo** para uma futura `/saas-pay/:token` ou `/fatura-plataforma/:token`, com entidade e validações diferentes.

### 5.4 Token já existente para pagamento anónimo (cartão)

- **`checkout_inline_pay_token`** em `gateway_metadata`, usado em **`POST /api/billing/:billingId/pay-with-card`** (`billingPayCardController.ts`).
- Hoje o token **autoriza pagamento com cartão** quando não há JWT; **não** foi desenhado como URL de visualização pública nem exposto como link único de “fatura” no sentido de marketing/UX.

---

## 6. Super Admin — controlo financeiro hoje

### 6.1 O que já existe

- **`SuperAdminClientFaturamento.tsx`**: por **tenant** (`/api/superadmin/tenants/:id/billing`), mostra plano, próxima cobrança, histórico de linhas `tenant_billing`-like.
- **`createTenantCharge`**: cria cobrança e integra gateway.

### 6.2 Lacuna em relação ao pedido

- Não há, na investigação atual, uma **área global** “todas as cobranças da plataforma” com filtros (data, status, tenant, plano, gateway_reference) — apenas visão **por cliente (tenant)**.
- Para “controlo financeiro” central, a proposta natural é **nova listagem Super Admin** + endpoint agregador somente leitura (e ações já existentes por tenant se necessário).

---

## 7. Comparação de opções de produto (link enviado ao cliente)

### Opção A — Continuar link bruto do Asaas (status quo)

| Prós | Contras |
|------|---------|
| Zero risco de regressão de entrega | UX fraca, marca da plataforma ausente |
| Funciona sem login | Menos controlo de redirecionamentos e mensagens |
| | Super Admin não “possui” o link como ativo digital próprio |

### Opção B — Mandar link para o `/checkout`

| Prós | Contras |
|------|---------|
| Reutiliza UI existente | Mistura **fluxo de contratação** com **pagamento de fatura já emitida** se não for cuidadosamente parametrizado |
| | Checkout anónimo pode exigir contexto (tenant, CPF) já preenchido — risco de re-entrada confusa |
| | URL com `billingId` UUID sem token é **IDOR** se algum passo for público; hoje o fluxo seguro exige auth ou `inline_pay_token` em APIs específicas |

**Conclusão técnica:** link direto ao checkout **pode** ser uma ponte intermédia (ex.: query `?billing=…&token=…`), mas **não** deve ser apenas “abrir checkout genérico” sem um modo explícito “pagar esta fatura”.

### Opção C — Página / fatura única da plataforma (recomendada)

| Prós | Contras |
|------|---------|
| Uma URL estável, com branding PainelCRM | Exige novo desenho de **token** (ou redefinição cuidadosa do existente) e **API pública mínima** |
| Reutiliza **a mesma** linha `tenant_billing` e a mesma cobrança no Asaas | Superfície de ataque: exposição de dados limitados + tentativas de força bruta em token |
| Pode mostrar plano, valor, vencimento, status, CTAs PIX/boleto/cartão **chamando** os mesmos endpoints de preparação/pagamento já usados no `InternalBillingCheckout` | Trabalho de implementação em fases (ver secção 11) |
| Alinha com o padrão já usado em `/pay/:token` para outro domínio | |

**Recomendação:** **Opção C** como alvo — confirmando a expectativa do produto — com página **dedicada** “pagamento de fatura SaaS” (não reabrir o wizard completo de contratação), token **opaco** na URL, e **sem recriar** cobrança no gateway.

---

## 8. Proposta — Super Admin: estrutura de controlo financeiro

Sem implementar agora, a estrutura sugerida:

1. **API** (exemplo conceitual): `GET /api/superadmin/platform-billings?status=&tenant_id=&from=&to=&limit=&cursor=`  
   - Fonte: `tenant_billing` + join `tenants`, `plans`.  
   - Campos: id, tenant (nome, id), plano (nome, id), `amount_cents`, `due_date`, `status`, `paid_at`, `invoice_number`, `gateway_reference_id`, `billing_reason`, `created_at`.  
   - **Não** expor `gateway_metadata` completo por defeito (PII / URLs internas); opcional campo derivado `has_public_pay_link`.

2. **UI**: nova página ou secção “Cobranças da plataforma” (tabela + filtros + detalhe em drawer).  
   - Link para abrir **ficha do tenant** já existente (`SuperAdminClientFaturamento`).  
   - Campo “link público” = URL da plataforma com token (após Fase 2), ou “—” se ainda não gerado.

3. **Ações**: nesta fase, privilegiar **visualização** e **deep-link**; ações destrutivas (cancelar no gateway, estornar) exigem política própria e não são pré-requisito do link próprio.

---

## 9. Proposta — link público seguro para a mesma `tenant_billing`

### 9.1 Princípios

- **Não** recriar cobrança ao abrir a página.
- **Não** substituir o `billingId` por identificador público adivinhável sem segredo (evitar IDOR).
- Token com entropia alta (ex.: UUID v4 ou string 32+ caracteres), armazenado em **`gateway_metadata`** (ex.: `platform_public_pay_token`) ou coluna dedicada futura — avaliar migração vs JSON existente.
- **GET público** retorna apenas DTO seguro: valores, datas, status, método, labels de plano, **não** e-mail completo de terceiros se não necessário.

### 9.2 Pagamento na mesma página

Reutilizar a **lógica** já existente:

- Preparar PIX/boleto: os mesmos fluxos que `InternalBillingCheckout` / `PlanCheckout` chamam (conforme método).
- Cartão: já existe **`inline_pay_token`** — avaliar **unificar** com o token de visualização (escopos: `view` vs `pay_card`) ou **dois** tokens para reduzir blast radius.

### 9.3 Notificação

- Novo merge field sugerido: `billing.platform_invoice_url` = `{FRONTEND_URL}/…/{token}`.  
- Manter temporariamente link Asaas como **fallback** em template ou em “saiba mais” até validação em produção — alinhado ao pedido de não remover Asaas nesta etapa.

---

## 10. Riscos e cuidados de produção

| Risco | Mitigação |
|-------|-----------|
| Token vazado (WhatsApp encaminhado) | Tratar como segredo equivalente a “link de pagamento”; considerar expiração opcional após `paid` / TTL para visualização |
| Enumeração / brute force | Rate limit em GET público; token longo; monitorização |
| Divergência status UI vs gateway | Continuar a usar `tenant_billing.status` + webhooks como fonte de verdade; polling já usado no checkout interno |
| PII em página pública | Minimizar dados; alinhar à LGPD; não listar dados de clientes finais do tenant |
| Overrides de template Super Admin | Documentar novos merge fields após implementação futura |
| Ambientes multi-domínio | `FRONTEND_URL` consistente na construção do link |

---

## 11. Plano de implementação sugerido (fases, após aprovação)

**Fase 1 — Contrato e dados**  
- Definir nome da rota pública (ex.: `/fatura-saas/:token` ou `/cobranca-plataforma/:token`).  
- Persistir token opaco por `tenant_billing` (metadata ou coluna).  
- `GET` público read-only + testes de autorização negativa (token errado, fatura de outro tenant).

**Fase 2 — UI página fina**  
- Nova página: resumo + status + botões “Pagar com PIX / Boleto / Cartão” reutilizando componentes de `InternalBillingCheckout` / helpers `saasBillingPayHelpers` sem montar o fluxo comercial completo.

**Fase 3 — Notificações**  
- Adicionar merge field e atualizar template sistema (com fallback Asaas até cutover).  
- Opcional: gerar token na criação da cobrança ou na primeira notificação.

**Fase 4 — Super Admin**  
- Listagem global + detalhe + cópia de link público.

**Fase 5 — Hardening**  
- Métricas, logs, rate limit, revisão de conteúdo legal na página pública.

---

## 12. Referências de código (âncoras)

- Entidade e CRUD: `packages/backend/src/services/invoiceService.ts`  
- Criação no checkout: `packages/backend/src/services/subscriptionService.ts` (`subscribePlan`), `packages/backend/src/controllers/planPurchaseController.ts`  
- Lista hub tenant: `packages/backend/src/services/commercialTenantBillingsHubService.ts`, `GET /api/me/tenant/commercial-billings`  
- Link na notificação: `packages/backend/src/services/platformNotifications/platformBusinessNotifications.ts` (`pickPaymentLinkFromBilling`, `publishPlatformBillingChargeCreated`)  
- Checkout autenticado por fatura: `src/pages/InternalBillingCheckout.tsx`, rota `/saas-billing/:billingId/pay` em `src/App.tsx`  
- Padrão público token (outro domínio): `src/pages/CustomerInvoicePay.tsx`, `/pay/:token`  
- Super Admin por tenant: `src/pages/superadmin/SuperAdminClientFaturamento.tsx`

---

## 13. Resposta objetiva aos itens do pedido

1. **Estrutura atual:** cobrança da plataforma = **`tenant_billing`**, relacionada a `tenant_id`, plano, gateway e `gateway_metadata`.  
2. **Onde nasce:** principalmente **`subscribePlan`** no checkout e **`createTenantCharge`** no Super Admin.  
3. **Motor de notificações:** `billing.payment_link` = primeiro URL/string útil no **metadata do Asaas** (`pickPaymentLinkFromBilling`).  
4. **Comparação A / B / C:** **C recomendada**; **B** só com modo “pagar esta fatura” + token; **A** mantém-se como fallback.  
5. **Super Admin:** evoluir de visão por tenant para **listagem global** + detalhe; reutilizar joins em `tenant_billing`.  
6. **Fatura única / link único:** nova rota pública + token opaco, mesma linha `tenant_billing`, sem nova cobrança no gateway.  
7. **Riscos:** token, IDOR, PII, consistência de status — ver secção 10.  
8. **Fases:** secção 11.
