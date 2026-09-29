# PI Sprint 3 — Executor de import + relatório

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S3** (feito) |
| **Plano-mãe** | [`PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md`](./PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md) |
| **Anterior** | [`SPRINT_PI_S2_WOO_PARSER_SIMPLE.md`](./SPRINT_PI_S2_WOO_PARSER_SIMPLE.md) |
| **Próximo** | **S4** — variable + variation |

---

## Entregas

| Artefato | Mudança |
|----------|---------|
| `ProductImportDialog` | Botão **Importar N produtos** → create em lotes de 3 + barra + relatório |
| `Products.tsx` | `onImportComplete` → `loadData()` |
| `ProductsService.createProduct` | **PIA1:** `status: productData.status ?? 'active'` |
| `ProductFormData` | `status?` opcional |

### Fluxo

1. Escolher CSV → preview (S2)
2. **Importar N produtos** → barra de progresso
3. Relatório: criados / falhas / skips do parse
4. Lista do catálogo atualiza se `created > 0`

Dialog bloqueia fechar durante import.

### MVP utilizável

Produtos **simple** do WooCommerce passam a aparecer no Catálogo (e na loja se `active` + `is_public`), com URLs de imagem externas.

---

## Critério de aceite S3

- [x] Create via API a partir do preview
- [x] Progresso + relatório
- [x] Refresh da lista
- [x] Status draft respeitado quando `Publicado=0` (PIA1)
- [x] Empty-state já tinha CTA Importar (S1)

---

## Próximo kickoff

Em chat: **`ok sprint 4`** — produtos variable/variation.
