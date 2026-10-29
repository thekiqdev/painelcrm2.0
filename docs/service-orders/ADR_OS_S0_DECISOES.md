# ADR — Ordem de Serviço (Sprint OS-S0)

| Campo | Valor |
|-------|-------|
| **Status** | **Aceito** (Sprint 0) |
| **Data** | 2026-10-28 |
| **Sprint** | OS-S0 |
| **Investigação** | [`../INVESTIGACAO_ORDEM_DE_SERVICO.md`](../INVESTIGACAO_ORDEM_DE_SERVICO.md) |
| **Plano** | [`../PLANO_SPRINTS_ORDEM_DE_SERVICO.md`](../PLANO_SPRINTS_ORDEM_DE_SERVICO.md) |
| **Próximo** | OS-S1 — Schema + API CRUD |

---

## 1. Contexto

O CRM precisa de **Ordem de Serviço** completa para o cliente do tenant (documento A4, visita técnica, assinatura online, fatura). Não existe domínio OS no código. Contratos, propostas, agenda e `customer_invoices` cobrem pedaços isolados.

Este ADR **trava** as decisões de produto/arquitetura antes do schema real (S1).

---

## 2. Decisões fechadas (D1–D12)

| ID | Tema | Decisão | Alternativas rejeitadas |
|----|------|---------|-------------------------|
| **D1** | Domínio | Tabelas próprias `service_orders*` | Estender `contracts` ou `orders` |
| **D2** | Documento v1 | HTML template A4 → PDFKit (layout do PDF GestãoClick anexo) | Upload PDF livre (`pdf_signature`) na v1 |
| **D3** | Assinatura | Padrão tokens view/sign dos contratos; papéis `client` (obrigatório no envio) e `technician` (opcional) | Só carimbo interno sem link público |
| **D4** | Faturamento | `billing_mode`: `none` \| `manual` \| `auto_on_sign` via `createManualInvoice` | Gerar só com `linked_invoice_id` de contrato |
| **D5** | Visita | `POST /api/appointments` + FK `appointments.service_order_id`; toggle `create_google_event` | Deep link só para Agenda sem vínculo |
| **D6** | Itens | Tabela `service_order_items` com `kind` (`service`\|`product`), snapshot de nome/unidade/preço; `product_id` opcional | Só JSONB sem linhas; ou pedidos da loja |
| **D7** | Feature | Flag/módulo `service_orders` (default **OFF** até go-live) | Ligar no menu sem flag |
| **D8** | Cadência | ~1 semana / sprint (S0–S7) | Big-bang único |
| **D9** | Numeração | Inteiro sequencial **por tenant** (`service_order_number`) | UUID na UI; sequência global da plataforma |
| **D10** | Tenant scope | Coluna `tenant_id` em todas as tabelas OS; helpers `tenantScope` / `ensureTenantIdForInsert` | Só `user_id` + JOIN (legado contratos) |
| **D11** | Endereço | Snapshot do cliente + `execution_address` na OS; **não** bloqueia S1 em evoluir `clients` | Exigir endereço completo no cadastro antes de OS |
| **D12** | Estoque | **Sem** baixa automática na v1 | Debitar `products` ao assinar/concluir |

---

## 3. Nomes canônicos (congelados)

| Conceito | Nome |
|----------|------|
| Feature flag / plan feature | `service_orders` |
| Module permission id | `service_orders` |
| API prefix | `/api/service-orders` |
| Rotas SPA autenticadas | `/service-orders`, `/service-orders/new`, `/service-orders/:id` |
| Rotas SPA públicas | `/service-order-view/:token`, `/service-order-sign/:token` |
| Event keys notificação | `service_order.sent`, `service_order.signed`, `service_order.invoice_created` |
| Storage PDF (futuro) | `service-orders-pdf/{tenantId}/{serviceOrderId}/…` |

---

## 4. Status machine (v1)

```
draft
  → scheduled          (opcional: visita marcada)
  → in_progress        (execução iniciada / período_start preenchido)
  → awaiting_signature (documento frozen + invites)
  → signed
  → invoiced           (após conversão bem-sucedida; também pode coexistir signed+invoice)
  → completed          (fechamento operacional; saída preenchida)
  → cancelled          (terminal)
```

**Regras:**

- Edição livre de corpo/itens apenas em `draft` | `scheduled` | `in_progress`.
- Ao entrar em `awaiting_signature`: freeze HTML + bloqueio de itens/valores (igual espírito dos contratos).
- `cancelled` não gera fatura; se já houver fatura, política S5 (não cancelar fatura paga automaticamente).
- Transições finas e guards ficam no service S1/S4; este ADR só define o conjunto de valores.

---

## 5. Schema draft (não migrar ainda — S1)

```sql
-- RASCUNHO OS-S0 — implementação real em Sprint 1

CREATE TABLE service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_by UUID NOT NULL REFERENCES users(id),
  responsible_user_id UUID NULL REFERENCES users(id), -- técnico
  service_order_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  client_id UUID NULL REFERENCES clients(id),
  client_snapshot JSONB NOT NULL DEFAULT '{}',
  execution_address JSONB NOT NULL DEFAULT '{}',
  period_start_at TIMESTAMPTZ NULL,
  period_end_at TIMESTAMPTZ NULL,
  equipment JSONB NULL,           -- { name, brand, model, serial, defects }
  observations TEXT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (billing_mode IN ('none', 'manual', 'auto_on_sign')),
  appointment_id UUID NULL,       -- visita principal (FK appointments em S6)
  converted_invoice_id UUID NULL,
  content_html TEXT NULL,
  content_snapshot_html TEXT NULL,
  document_frozen_at TIMESTAMPTZ NULL,
  total_services_cents BIGINT NOT NULL DEFAULT 0,
  total_products_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  signed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_order_number)
);

CREATE TABLE service_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('service', 'product')),
  product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  unit TEXT NOT NULL DEFAULT 'UN',
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price_cents BIGINT NOT NULL DEFAULT 0,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE service_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- S4: service_order_signers, public_view_tokens, signature_invites
-- S5: customer_invoices.service_order_id UNIQUE parcial
-- S6: appointments.service_order_id
```

**Checklist multi-tenant (S1):** ver [`../PADROES-TENANT-SCOPE.md`](../PADROES-TENANT-SCOPE.md) — INSERT com `ensureTenantIdForInsert`; list/get/update/delete sempre filtrar `tenant_id`; nunca aceitar `tenant_id` do body.

---

## 6. Merge fields

Catálogo congelado: [`MERGE_FIELDS_OS.md`](./MERGE_FIELDS_OS.md).  
Wireframe visual: [`wireframe/ordem_servico_a4.html`](./wireframe/ordem_servico_a4.html).

Sintaxe: `{{namespace.key}}` (igual contratos). Na v1 o documento é **template fixo do sistema** (não editor TipTap livre); merge fields alimentam o template A4.

---

## 7. Permissões (baseline S1; granulares S4/S5/S7)

| Action | Uso |
|--------|-----|
| `view` / `view_all` / `view_own` | Listagem e detalhe |
| `create` | Nova OS |
| `edit` / `edit_own` | Patch draft / itens |
| `delete` / `delete_own` | Excluir draft |
| `send` | Emitir / awaiting_signature (S4) |
| `request_signature` | Reenvio invite (S4) |
| `generate_invoice` | Converter fatura (S5) |
| `cancel` | Cancelar |

---

## 8. Critérios de aceite do Sprint 0

- [x] Decisões D1–D12 documentadas e aceitas neste ADR  
- [x] Nomes canônicos (flag, rotas, event keys) congelados  
- [x] Schema draft SQL revisável  
- [x] Wireframe HTML A4 com dados do PDF modelo  
- [x] Catálogo de merge fields  
- [x] Checklist tenant-scope apontado  
- [x] Notas S0 + plano atualizado  

**Fora de S0:** migrations rodando, rotas Express, UI React.

---

## 9. Próximo passo

**OS-S1:** migração real a partir do schema draft + `MODULE_IDS` + CRUD `/api/service-orders` com isolamento multi-tenant e totais de itens.
