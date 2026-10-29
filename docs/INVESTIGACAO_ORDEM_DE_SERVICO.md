# Investigação — Ordem de Serviço (OS)

**Data:** 28/10/2026  
**Projeto:** `painelcrm`  
**Escopo:** mapear o que o sistema já oferece (agenda, pagamento, assinatura online, clientes, produtos/serviços, propostas, contratos) e o que falta para um módulo nativo de **Ordem de Serviço**, alinhado ao PDF/modelo anexo (`Ordem_de_servico_138_OIKOS_…`).  
**Conclusão prévia:** **não existe** módulo `service_orders` / “ordem de serviço” no repositório hoje. O caminho correto é **módulo novo** reutilizando padrões maduros — **não** herdar a tabela `contracts`.

---

## 1. Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| Já existe OS no sistema? | **Não.** Nenhuma tabela, rota, página ou feature flag com esse domínio. |
| O PDF modelo exige o quê? | Cabeçalho do tenant, nº da OS, período de execução, dados do cliente, equipamento (opcional), serviços, produtos, totais, observações, assinaturas cliente + técnico. |
| Melhor “irmão” comercial? | **Propostas** — itens catálogo/manual + conversão em fatura (`convert-to-invoice` / auto pós-aceite). |
| Melhor “irmão” documental/assinatura? | **Contratos** — tokens públicos view/sign, freeze/snapshot, PDF, SignaturePad, notificações `*.sent`. |
| Visita técnica? | **Agenda** (`appointments`) com tipo `visit` + flag `create_google_event`. |
| Gerar cobrança? | **`POST /api/customer-invoices`** via `createManualInvoice` (Asaas/Stripe/MP). Contratos **não** geram fatura na assinatura. |
| Produtos vs serviços? | Mesmo catálogo `products` com `type: 'product' \| 'service'`. |

**Estratégia recomendada:** criar domínio próprio `service_orders` clonando *padrões arquiteturais* (tenant JOIN, permissões, tokens, PDFKit, editor de itens, `createAppointment`, `createManualInvoice`), sem misturar linhas com `contracts` ou `proposals`.

---

## 2. Modelo de documento (PDF anexo)

Fonte: `Ordem_de_servico_138_OIKOS_SOLUCOES_AMBIENTAIS_LTDA.pdf` (1 página, referência GestãoClick).

### 2.1 Estrutura visual / campos

| Bloco | Campos observados |
|-------|-------------------|
| **Cabeçalho tenant** | Nome fantasia/razão, telefones, e-mail, CNPJ, responsável, endereço completo |
| **Identificação** | `ORDEM DE SERVIÇO Nº {n}` + data de emissão |
| **Período de execução** | Entrada (`dd/mm/yyyy - hh:mm`) · Saída (preenchível / posterior) |
| **Dados do cliente** | Razão social, nome fantasia, CNPJ/CPF, endereço, CEP, cidade/UF, telefone(s), e-mail |
| **Equipamento** (opcional por segmento) | Nome, marca, modelo, série, defeitos |
| **Serviços** | ITEM · NOME · QTD · VR. UNIT. · SUBTOTAL |
| **Produtos** | ITEM · NOME · UND. · QTD · VR. UNIT. · SUBTOTAL |
| **Totais** | Soma produtos · soma serviços · total geral |
| **Observações** | Texto livre |
| **Assinaturas** | Assinatura do cliente · Assinatura do técnico |
| **Rodapé** | Origem da emissão (no anexo: sistema externo) |

### 2.2 Gaps do CRM atual vs o PDF

| Necessidade do PDF | Estado no CRM |
|--------------------|---------------|
| Branding/endereço/CNPJ do **tenant** | Parcial: `tenants.company_*` + logos (`125_tenant_company_branding.sql`); CNPJ/responsável dependem de dados da empresa / perfil — validar cobertura na UI “Dados da Empresa”. |
| Dados do **cliente** (razão, fantasia, endereço, CEP, cidade) | Parcial: `clients` tem `name`, `company`, `email`, `phone`, `cpf_cnpj`. **Não há** colunas maduras de endereço no cadastro de cliente (gap). OS deve ter **snapshot** do cliente + **endereço de execução** próprio. |
| Período entrada/saída | Novo (campos da OS). |
| Equipamento / defeitos | Novo (JSONB ou tabela filha; feature opcional por tenant/segmento). |
| Serviços e produtos em tabelas separadas | Catálogo unificado `products.type`; UI deve separar seções como no PDF. |
| Assinatura cliente + técnico | Padrão de contratos (1+ signatários) reaproveitável com papéis `client` / `technician`. |
| Numeração sequencial por tenant | Novo (`service_order_number` com sequence/unique por `tenant_id`). |

---

## 3. Arquitetura do sistema (contexto)

```
Frontend (Vite/React)  →  /api/* (Express JWT + tenant)  →  PostgreSQL
                         ↘ /api/public/* (tokens opacos)
```

- Isolamento multi-tenant: `req.tenantId` + JOINs em `users.tenant_id` (ver `CONTRIBUTING.md` / `docs/PLANO-ISOLAMENTO-MULTI-TENANT.md`).
- Feature flags de plano + `assertModulePermission(module, action)`.
- Módulos já registrados em `MODULE_IDS` (`modulePermissionsService.ts`): `clients`, `products`, `proposals`, `contracts`, `billing`, `finance`, `agenda`, … — **sem** `service_orders`.

---

## 4. Inventário do que reutilizar

### 4.1 Clientes — busca e extração automática

| Peça | Onde |
|------|------|
| Combobox remoto | `src/components/clients/ClientSearchCombobox.tsx` (`remoteSearch` → `GET /api/clients?q=`) |
| API | `packages/backend/src/routes/clientsRoutes.ts` / `clientsController.ts` |
| Campos úteis | `name`, `company`, `email`, `phone`, `whatsapp`, `cpf_cnpj` |
| Criação inline | `AddClientDialog` (já usado em contratos) |
| Prefill | Query `?clientId=` (padrão `NewContract.tsx`) |

**Recomendação OS:** ao selecionar cliente, hidratar formulário (snapshot em JSON na OS) e permitir editar endereço de atendimento sem alterar o cadastro (ou com botão “salvar no cliente” fase 2).

### 4.2 Produtos e serviços

| Peça | Onde |
|------|------|
| Tabela | `products` — `type IN ('product','service')` (`06_create_products.sql`) |
| API | `GET/POST /api/products` |
| UI itens | `src/components/proposals/ProposalItemsEditor.tsx` (manual **ou** cópia do catálogo; **sem** `product_id` persistido após inserção) |
| Serviço | extras: `duration_hours`, `is_recurring`, … |
| Produto | SKU, estoque, variantes |

**Gap:** não há campo `unit` (UN, CX, etc.) no catálogo; o PDF de produtos tem coluna **UND.** — gravar unidade no item da OS (default `UN`) ou evoluir catálogo depois.

### 4.3 Agenda / visita técnica / Google Calendar

| Peça | Onde |
|------|------|
| Doc | `docs/PLANO_MODULO_AGENDA_E_GOOGLE_CALENDAR.md` |
| Tabela | `appointments` (+ attendees, type settings, Google fields) |
| API criar | `POST /api/appointments` → `createAppointment()` |
| Google | Checkbox `create_google_event` (one-way CRM→Google; conta do **criador**) |
| Tipo visita | Seed `visit` → label “Visita”; pode criar `visita_tecnica` em type-settings |
| Referência de integração | Chat: `chatAppointmentsController` + `ChatAppointmentSchedulePanel` |
| Deep link | `/agenda?client_id=…&new=1` |

**Não existe** FK `service_order_id` em appointments — será extensão necessária.

**UX pedida:** botão “Marcar na agenda” com opção **sincronizar Google ou não** → mapear 1:1 para `create_google_event: true|false`.

### 4.4 Assinatura online e PDF (contratos)

> Atenção: `docs/MAPA_TECNICO_CONTRATOS.md` e `docs/INVESTIGACAO_CONTRATOS.md` estão **desatualizados**. Fonte de verdade: código + `docs/ETAPA_4_CONTRATOS_ASSINATURA_PUBLICA.md`, `docs/CONTRATOS_VIEW_PUBLICA_ASSINATURAS_E_PDF.md`.

| Capacidade | Onde |
|------------|------|
| Tokens view / sign (SHA-256) | `contract_public_view_tokens`, `contract_signer_signature_invites` |
| Páginas públicas | `/contract-view/:token`, `/contract-sign/:token` |
| SignaturePad + PNG | `src/components/contracts/SignaturePad.tsx` |
| Freeze / snapshot HTML | `content_snapshot_html`, `document_frozen_at` |
| PDF on-demand (HTML→PDFKit) | `contractPdfService.ts` |
| Modo PDF upload + campos | `document_kind = pdf_signature` |
| Notificação envio | `publishContractSentNotifications` / event `contract.sent` |
| Permissões granulares | `contracts.send`, `request_signature`, `view_signed_files`, … |

**Para OS:** clonar o *padrão* (tokens, páginas públicas, pad, PDF A4, event_key de notificação). Preferir documento **HTML/template A4** espelhando o PDF anexo (mais simples que upload PDF livre na v1).

**Importante:** contrato **não** gera fatura ao assinar (`linked_invoice_id` é só vínculo opcional).

### 4.5 Faturas / pagamento (cliente do tenant)

| Capacidade | Onde |
|------------|------|
| Fatura CRM | `customer_invoices` + `customer_invoice_items` |
| Criar avulsa | `POST /api/customer-invoices` → `createManualInvoice` |
| Link público | `/pay/:token` + `GET/POST /api/public/customer-invoices/pay/:token` |
| Gateways | Asaas (principal), Stripe tenant, Mercado Pago (fluxo separado) |
| Pré-condições | CPF/CNPJ + gateway configurado (`/preconditions`) |
| Modelo auto/manual | **Propostas:** `post_accept_billing_mode` (`none` \| `notify_team` \| `auto_pending_invoice`) + `POST …/convert-to-invoice` |

**Para OS:**

- Botão **Gerar fatura** → espelhar `proposalInvoiceConversionService`.
- **Ao assinar** (opção) → espelhar hook `onProposalPublicAccepted` / `auto_pending_invoice`.
- Nova FK: `customer_invoices.service_order_id` (unique parcial) + `service_orders.converted_invoice_id`.

**Evitar:** tabela legada `/api/invoices` e conflitar com billing SaaS da plataforma.

### 4.6 Propostas (template de fluxo comercial)

| Peça | Valor para OS |
|------|----------------|
| Itens JSONB + totais | Modelo de linhas snapshot |
| Status machine + timeline | Padrão de auditoria leve |
| Conversão → fatura | Copiar serviço quase literal |
| Aceite público + billing mode | Analogia à assinatura → cobrança |

Diferença: OS é **operacional** (execução, visita, técnico, saída), não só comercial.

---

## 5. O que NÃO reutilizar diretamente

| Tentação | Por quê evitar |
|----------|----------------|
| Estender `contracts` como OS | Status, PDF e assinatura diferentes; poluir domínio jurídico/comercial. |
| Usar só `orders` da loja | Checkout/estoque/anônimo; não cobre visita/assinatura técnica. |
| Gerar fatura só com `linked_invoice_id` de contrato | Sem pipeline; UX inexistente. |
| Sync Google two-way | Não existe; só CRM→Google. |
| Assumir endereço completo no `clients` | Gap de schema; snapshot + endereço na OS. |

---

## 6. Modelo de dados proposto (rascunho de investigação)

### 6.1 Tabelas novas

```
service_orders
  id, tenant_id, created_by, responsible_user_id (técnico)
  service_order_number (unique por tenant)
  status: draft | scheduled | in_progress | awaiting_signature | signed | invoiced | cancelled | completed
  client_id (FK)
  client_snapshot JSONB          -- cópia dos dados exibidos no PDF
  execution_address JSONB        -- endereço de atendimento
  period_start_at, period_end_at -- entrada / saída
  equipment JSONB nullable       -- nome, marca, modelo, série, defects
  notes / observations
  billing_mode: none | manual | auto_on_sign
  converted_invoice_id
  appointment_id nullable        -- visita principal (ou tabela N:N)
  content_snapshot_html / frozen_at
  total_services_cents, total_products_cents, total_cents
  currency, signed_at, …
  timestamps

service_order_items
  id, service_order_id, tenant_id
  kind: 'service' | 'product'
  product_id nullable            -- vínculo opcional ao catálogo
  name, description, unit
  quantity, unit_price_cents, discount_cents, subtotal_cents
  sort_order

service_order_signers
  role: 'client' | 'technician' | 'other'
  name, email, phone, tax_id
  signed_at, signature_data JSONB
  (+ invites / tokens no padrão contratos)

service_order_events          -- timeline
service_order_public_tokens   -- view
service_order_signature_invites
```

### 6.2 Extensões em tabelas existentes

| Tabela | Mudança |
|--------|---------|
| `appointments` | `service_order_id UUID NULL` (+ índice) |
| `customer_invoices` | `service_order_id UUID NULL` + unique parcial |
| `MODULE_IDS` / plan features / permission catalog | módulo `service_orders` |
| Seeds de notificação | `service_order.sent`, `service_order.signed`, `service_order.invoice_created` |

---

## 7. Fluxos de negócio alvo

### 7.1 Criação

1. Usuário abre **Nova OS** (menu / perfil do cliente / chat).
2. Busca cliente (`ClientSearchCombobox`) → extrai dados → snapshot editável.
3. Informa período de execução (entrada; saída pode ficar vazia até conclusão).
4. Opcional: **Visita técnica** → cria `appointment` (`type=visit|visita_tecnica`) com toggle Google.
5. Adiciona **serviços** e **produtos** (catálogo ou manual).
6. Observações / equipamento.
7. Salva `draft` ou envia para assinatura.

### 7.2 Assinatura e PDF

1. Freeze do HTML A4 (layout do modelo).
2. Bootstrap de invites (cliente + técnico se aplicável).
3. Notificação com `view_link` / `sign_link`.
4. Páginas públicas `/service-order-view|:sign/:token`.
5. Ao completar assinaturas → status `signed` + PDF baixável.

### 7.3 Pagamento

| Modo | Comportamento |
|------|----------------|
| `manual` (default) | Botão **Gerar fatura** na OS assinada (ou elegível). |
| `auto_on_sign` | Hook pós-assinatura → `createManualInvoice` com itens da OS. |
| `none` | Só documento operacional. |

Pré-condições iguais às faturas: gateway + CPF/CNPJ quando cobrança online.

---

## 8. Superfície de produto (UI)

| Rota sugerida | Página |
|---------------|--------|
| `/service-orders` | Listagem + filtros (status, cliente, técnico, período) |
| `/service-orders/new` | Wizard/formulário de criação |
| `/service-orders/:id` | Detalhe (abas: resumo, itens, visita, assinaturas, fatura, histórico) |
| `/service-orders/:id/edit` | Edição (bloqueada após freeze/sign conforme regras) |
| `/service-order-view/:token` | Público |
| `/service-order-sign/:token` | Público |

Menu: feature flag `service_orders` + permissão módulo. Entrada também em `ClientProfile` e deep link da Agenda.

---

## 9. Permissões e feature flag

Espelhar `contracts` / `proposals`:

- Flag de plano: `service_orders`
- Ações: `view`, `view_all`, `view_own`, `create`, `edit`, `edit_own`, `delete`, `send`, `request_signature`, `generate_invoice`, `cancel`
- Extras UI alinhados ao `RolePermissionsDialog`

---

## 10. Riscos e decisões abertas

| # | Decisão | Opções | Recomendação |
|---|--------|--------|--------------|
| D1 | Assinatura obrigatória? | Sempre / opcional por OS | Opcional; default “enviar para assinatura” na v1 |
| D2 | Quem assina? | Só cliente / cliente+técnico | Cliente obrigatório no envio; técnico opcional (campo no PDF) |
| D3 | Estoque ao usar produto | Baixa automática / não | **Não** na v1 (só snapshot); fase 2 se loja ativa |
| D4 | Endereço no cadastro cliente | Migrar schema clients / só na OS | Snapshot + endereço na OS; evoluir clients em sprint paralelo se desejado |
| D5 | Equipamento | Sempre / feature flag segmento | Campo opcional na OS (JSONB) |
| D6 | Numeração | Por tenant seq / por ano | Sequence por `tenant_id` (como nº 138 do modelo) |
| D7 | PDF | HTML→PDFKit / upload | HTML A4 fiel ao modelo na v1 |
| D8 | Múltiplas visitas | 1:1 / 1:N | 1 visita principal na v1; N:N depois |
| D9 | Google Calendar | Conta do criador vs responsável | Manter comportamento atual da Agenda; UX deve avisar |

---

## 11. Matriz de reuso (síntese)

| Capacidade OS | Origem no sistema | Esforço |
|---------------|-------------------|---------|
| Busca/extrair cliente | `ClientSearchCombobox` + clients API | Baixo |
| Itens serviço/produto | `ProposalItemsEditor` + `products` | Baixo–médio |
| Visita + Google opcional | `createAppointment` + checkbox | Baixo |
| Assinatura + links públicos | Padrão contratos | Médio |
| PDF A4 | `contractPdfService` / layout novo | Médio |
| Gerar fatura auto/manual | Propostas + `createManualInvoice` | Médio |
| Notificações WhatsApp/e-mail | Notifications engine | Baixo–médio |
| Permissões / flag | `MODULE_IDS` + catalog | Baixo |
| Schema + CRUD + UI list/detail | **Novo** | Alto |
| Layout PDF idêntico ao modelo | **Novo** | Médio |

---

## 12. Referências de código e docs

### Código
- Contratos: `packages/backend/src/routes/contractsRoutes.ts`, `publicRoutes.ts`, `src/pages/PublicContractSign.tsx`
- Agenda: `appointmentsRoutes.ts`, `appointmentsService.ts`, `src/pages/agenda/AgendaPage.tsx`
- Faturas: `customerInvoicesRoutes.ts`, `customerBillingService.ts`
- Propostas: `proposalInvoiceConversionService.ts`, `ProposalItemsEditor.tsx`
- Produtos: `productsRoutes.ts`, `06_create_products.sql`
- Branding tenant: `125_tenant_company_branding.sql`

### Docs
- `docs/ETAPA_4_CONTRATOS_ASSINATURA_PUBLICA.md`
- `docs/ETAPA_2_PROPOSTAS_ESTRUTURA_E_FATURA.md`
- `docs/PLANO_MODULO_AGENDA_E_GOOGLE_CALENDAR.md`
- `docs/contexto/DIAGNOSTICO_MODULO_PRODUTOS_SERVICOS.md` (se presente)
- `CONTRIBUTING.md` (checklist multi-tenant)

---

## 13. Próximo artefato

Plano de implantação por sprints: **[`PLANO_SPRINTS_ORDEM_DE_SERVICO.md`](./PLANO_SPRINTS_ORDEM_DE_SERVICO.md)**.

**Sprint 0 (feito):** [`service-orders/ADR_OS_S0_DECISOES.md`](./service-orders/ADR_OS_S0_DECISOES.md) · [`MERGE_FIELDS_OS.md`](./service-orders/MERGE_FIELDS_OS.md) · [`wireframe/ordem_servico_a4.html`](./service-orders/wireframe/ordem_servico_a4.html).
