# Catálogo de merge fields — Ordem de Serviço

**Sprint:** OS-S0 (congelado)  
**Sintaxe no template:** `{{namespace.key}}`  
**Uso v1:** template A4 fixo do sistema (não editor livre). Resolução real a partir de S3.

Espelha a organização de `contractMergeFieldCatalog.ts` (categorias + key estável).

---

## system (empresa / plataforma)

| Key | Label | Fonte |
|-----|-------|-------|
| `system.name` | Nome público do sistema | `APP_PUBLIC_NAME` / padrão |
| `system.date` | Data atual ISO | servidor |
| `system.date_formatted` | Data `dd/mm/aaaa` | servidor |
| `system.tenant_name` | Nome da empresa (tenant) | `tenants.name` |
| `system.tenant_trade_name` | Nome fantasia (se houver) | branding / profile |
| `system.tenant_document` | CNPJ/CPF da empresa | dados da empresa |
| `system.tenant_phone` | Telefone(s) | `tenants.company_whatsapp` / profile |
| `system.tenant_email` | E-mail comercial | profile / settings |
| `system.tenant_address` | Endereço completo | `company_address_line` + city/state/postal |
| `system.tenant_city_uf` | Cidade/UF | `company_city` / `company_state` |
| `system.tenant_postal_code` | CEP | `company_postal_code` |
| `system.tenant_logo_url` | URL logo (clara) | `logo_light_url` / `logo_url` |
| `system.responsible_name` | Responsável da emissão | usuário criador ou config |

---

## service_order (documento)

| Key | Label | Fonte |
|-----|-------|-------|
| `service_order.number` | Número da OS | `service_order_number` |
| `service_order.number_label` | Ex.: `ORDEM DE SERVIÇO Nº 138` | derivado |
| `service_order.issued_at` | Data emissão ISO | `created_at` ou freeze |
| `service_order.issued_at_formatted` | `dd/mm/aaaa` | derivado |
| `service_order.status` | Status | `status` |
| `service_order.period_start` | Entrada ISO | `period_start_at` |
| `service_order.period_start_formatted` | `dd/mm/aaaa - hh:mm` | derivado |
| `service_order.period_end` | Saída ISO | `period_end_at` |
| `service_order.period_end_formatted` | `dd/mm/aaaa - hh:mm` ou placeholders | derivado |
| `service_order.observations` | Observações | `observations` |
| `service_order.currency` | Moeda | `currency` |
| `service_order.total_services` | Total serviços (BRL) | `total_services_cents` |
| `service_order.total_products` | Total produtos (BRL) | `total_products_cents` |
| `service_order.total` | Total geral (BRL) | `total_cents` |
| `service_order.billing_mode` | Modo faturamento | `billing_mode` |

---

## client (snapshot na OS)

| Key | Label | Fonte |
|-----|-------|-------|
| `client.name` | Nome / razão social | snapshot / `clients.name` |
| `client.trade_name` | Nome fantasia | snapshot (`company` ou campo dedicado) |
| `client.document` | CPF/CNPJ | `cpf_cnpj` |
| `client.email` | E-mail | snapshot |
| `client.phone` | Telefone(s) | snapshot |
| `client.address` | Endereço de execução / exibição | `execution_address` ou snapshot |
| `client.postal_code` | CEP | execution_address |
| `client.city_uf` | Cidade/UF | execution_address |

> Na v1, o PDF usa o **snapshot + execution_address** da OS, não leitura live do cliente após freeze.

---

## equipment (opcional)

| Key | Label | Fonte |
|-----|-------|-------|
| `equipment.name` | Nome do equipamento | `equipment.name` |
| `equipment.brand` | Marca | `equipment.brand` |
| `equipment.model` | Modelo | `equipment.model` |
| `equipment.serial` | Série | `equipment.serial` |
| `equipment.defects` | Defeitos | `equipment.defects` |

Se `equipment` for `null`, o bloco some do HTML (S3).

---

## technician / operator

| Key | Label | Fonte |
|-----|-------|-------|
| `technician.name` | Nome do técnico | `responsible_user` profile |
| `technician.email` | E-mail | users/profile |
| `operator.name` | Quem emitiu | `created_by` |

---

## items (renderização tabular — não placeholders soltos)

Itens **não** usam `{{item.0.name}}` no template v1. O renderer (S3) injeta HTML das tabelas:

| Bloco | Filtro | Colunas |
|-------|--------|---------|
| Serviços | `kind = service` | #, nome, qtd, vr. unit., subtotal |
| Produtos | `kind = product` | #, nome, und., qtd, vr. unit., subtotal |

Campos por linha (API / JSON): `name`, `unit`, `quantity`, `unit_price_cents`, `discount_cents`, `subtotal_cents`, `product_id?`.

Placeholders de seção no wireframe:

- `{{service_order.services_table}}`
- `{{service_order.products_table}}`

---

## signer (S4)

| Key | Label | Fonte |
|-----|-------|-------|
| `signer.client_name` | Nome do signatário cliente | signers role=client |
| `signer.technician_name` | Nome do técnico signatário | signers role=technician |
| `signer.client_signed_at_formatted` | Data assinatura cliente | `signed_at` |
| `signer.technician_signed_at_formatted` | Data assinatura técnico | `signed_at` |

Imagens PNG vão no apêndice/runtime (como contratos), não como merge field de texto.

---

## Exemplo de resolução (dados do PDF modelo)

| Key | Valor exemplo |
|-----|----------------|
| `system.tenant_name` | Tec Suprema |
| `system.tenant_document` | 62.710.770/0001-85 |
| `system.responsible_name` | FABIO GOMES |
| `service_order.number` | 138 |
| `service_order.issued_at_formatted` | 22/09/2026 |
| `service_order.period_start_formatted` | 22/09/2026 - 18:36 |
| `client.name` | OIKOS SOLUCOES AMBIENTAIS LTDA |
| `client.trade_name` | GRUPO OIKOS |
| `client.document` | 17.024.794/0001-26 |
| `service_order.total_products` | 200,00 |
| `service_order.total_services` | 230,00 |
| `service_order.total` | R$ 430,00 |
