# PV Sprint 3 — Import Woo → variantes reais

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S3** (feito) |
| **Plano-mãe** | [`PLANO_VARIANTES_PRODUTO.md`](./PLANO_VARIANTES_PRODUTO.md) |
| **Anterior** | [`SPRINT_PV_S2_PRODUCT_FORM.md`](./SPRINT_PV_S2_PRODUCT_FORM.md) |
| **Próximo** | **S4** — Vitrine pública com seletor Cor/Tamanho |

---

## Entregas

| Artefato | Path |
|----------|------|
| Migration | `database/init/343_products_external_id_pv_s3.sql` |
| Parser | `src/utils/importWooProductsCsv.ts` — PV10 `variants[]` |
| Executor | `src/utils/productImportExecutor.ts` — rehost variantes + upsert `external_id`/SKU |
| API | `products.external_id` no create/update |
| Dialog | preview conta variantes; copy upsert atualizado |
| Testes | `importWooProductsCsv.test.ts` (14) · `productImportExecutor.test.ts` (5) |

### Comportamento

1. `variation` → 1 item em `payload.variants[]` (SKU, preço, estoque, imagens, `external_id`).
2. Eixos Color/Size → **Cor/Tamanho**; demais eixos ignorados no MVP.
3. Pai: `has_variants=true`, `variations` espelho, `price`=min, `stock_quantity`=soma.
4. Sem filhos no CSV → fallback sem grade (`has_variants=false`).
5. Upsert: `external_id` (ID Woo) primeiro; senão SKU.
6. Rehost aplica também a `variants[].images`.

### Critério de aceite S3

- [x] Fixture gera pai + N variantes com preço/foto/`external_id`
- [x] Color×Size mapeado para Cor×Tamanho
- [x] Upsert por ID Woo / SKU
- [x] Testes passando

---

## Próximo kickoff

Em chat: **`ok sprint 4`** — API/vitrine pública com seletor de variantes.
