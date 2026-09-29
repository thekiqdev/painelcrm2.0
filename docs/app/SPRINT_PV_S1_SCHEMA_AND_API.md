# PV Sprint 1 — Schema + API admin

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S1** (feito) |
| **Plano-mãe** | [`PLANO_VARIANTES_PRODUTO.md`](./PLANO_VARIANTES_PRODUTO.md) |
| **Anterior** | [`SPRINT_PV_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PV_S0_INVENTORY_AND_DECISIONS.md) |
| **Próximo** | **S2** — ProductForm Simples \| Variável + grade |

---

## Entregas

| Artefato | Path |
|----------|------|
| Migration | `database/init/342_product_variants_pv_s1.sql` |
| Order | `packages/backend/src/startup/migrationOrder.ts` |
| Serviço | `packages/backend/src/services/productVariantsService.ts` |
| Testes | `packages/backend/src/services/productVariantsService.test.ts` (7) |
| API | `packages/backend/src/controllers/productsController.ts` |
| Types FE | `src/types/products.ts` + `src/services/products.ts` |

### Schema

- `products.has_variants` / `products.track_inventory`
- Tabela `product_variants` com `tenant_id`, combo unique (`COALESCE(option2,'')`), SKU unique por tenant
- `cart_items.variant_id` / `order_items.variant_id` (nullable; uso pleno S5)
- RLS via `app_tenant_visible(tenant_id)`

### API admin

- `POST/PATCH /api/products` aceitam `has_variants`, `track_inventory`, `variants[]`
- Sync transacional: match por `id` → `external_id` → insert; ausentes no payload são apagados
- Pai variável: `stock_quantity` = soma ativas; `price` = min das ativas
- `GET /api/products/:id` retorna `variants[]`
- `GET /api/products` retorna `variants_count` (sem carregar grade)
- Delete produto limpa imagens do pai **e** das variantes (antes do CASCADE)
- Serviços + `has_variants` → 400; eixos só Cor/Tamanho (aliases Color/Size)

### Fora desta sprint

- UI Simples \| Variável → **S2**
- Import WC → rows reais → **S3**
- API/vitrine pública com variantes → **S4**
- Checkout `variant_id` + baixa estoque → **S5**

---

## Critério de aceite S1

- [x] Migration `342` registrada
- [x] CRUD admin com `variants[]` + agregados no pai
- [x] RLS / tenant_id / SKU único
- [x] Testes unitários de normalização + agregados
- [x] Types FE alinhados ao contrato

---

## Próximo kickoff

Em chat: **`ok sprint 2`** — ProductForm: 1ª escolha Simples \| Variável + grade Cor/Tamanho.
