# PV Sprint 2 — ProductForm Simples | Variável

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S2** (feito) |
| **Plano-mãe** | [`PLANO_VARIANTES_PRODUTO.md`](./PLANO_VARIANTES_PRODUTO.md) |
| **Anterior** | [`SPRINT_PV_S1_SCHEMA_AND_API.md`](./SPRINT_PV_S1_SCHEMA_AND_API.md) |
| **Próximo** | **S3** — Import Woo → `product_variants` reais |

---

## Entregas

| Artefato | Path |
|----------|------|
| Helpers + testes | `src/utils/productVariantsForm.ts` · `productVariantsForm.test.ts` (6) |
| Editor de grade | `src/components/products/ProductVariantsEditor.tsx` |
| Form principal | `src/pages/ProductForm.tsx` |

### Comportamento

1. **Estrutura** (após Tipo): **Produto simples** \| **Produto variável** (PV12 / PV-UX1).
2. **Simples:** preço, promo, SKU, estoque no pai; sem grade.
3. **Variável:** eixos Cor e/ou Tamanho → **Gerar combinações** → tabela (SKU, preço, promo, estoque, foto, ativo).
4. Payload: `has_variants` + `variations` (eixos) + `variants[]` — sem `pricing_mode` / `variation_prices`.
5. Troca variável→simples com confirmação (AlertDialog) se já houver variantes.
6. Serviços: seletor de estrutura oculto; `has_variants` forçado a false.

### Fora desta sprint

- Import WC → variantes reais → **S3**
- Vitrine pública → **S4**
- Checkout + baixa estoque → **S5**

---

## Critério de aceite S2

- [x] 1ª escolha Simples \| Variável no form de produto
- [x] Simples: fluxo preço/estoque limpo
- [x] Variável: Cor/Tamanho + grade editável persistida via API S1
- [x] Removida UI de `variation_prices` / Peso / personalizada do fluxo principal
- [x] Testes unitários dos helpers de grade

---

## Próximo kickoff

Em chat: **`ok sprint 3`** — Import WooCommerce gera rows em `product_variants`.
