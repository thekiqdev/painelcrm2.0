# PV Sprint 4 — Vitrine pública com variantes

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S4** (feito) |
| **Plano-mãe** | [`PLANO_VARIANTES_PRODUTO.md`](./PLANO_VARIANTES_PRODUTO.md) |
| **Anterior** | [`SPRINT_PV_S3_WOO_IMPORT_VARIANTS.md`](./SPRINT_PV_S3_WOO_IMPORT_VARIANTS.md) |
| **Próximo** | **S5** — baixa atômica de estoque + hardening · **feito** ([`SPRINT_PV_S5_CHECKOUT_STOCK.md`](./SPRINT_PV_S5_CHECKOUT_STOCK.md)) |

---

## Entregas

| Artefato | Path |
|----------|------|
| API pública | `productsController` — detalhe com `variants[]` ativas; lista com `has_variants` / `price_max` |
| Helpers | `src/utils/publicProductVariants.ts` (+ testes) |
| Seletor | `src/components/products/PublicProductVariantSelector.tsx` |
| Detalhe | `src/pages/PublicProduct.tsx` — Cor/Tamanho, foto/preço/estoque |
| Lista | `src/pages/PublicStore.tsx` — «A partir de» + «Ver opções» |
| Checkout | `variantId` na URL + body; preço da variante; `order_items.variant_id` + snapshot |

### Comportamento

1. Detalhe público carrega variantes ativas (PV14).
2. Seletor Cor e/ou Tamanho atualiza imagem, preço e disponibilidade.
3. Lista: «A partir de R$ …»; checkout direto só em produtos simples.
4. Checkout exige `variant_id` se `has_variants`; grava snapshot em `selected_variation`.
5. Baixa de estoque atômica permanece na **S5**.

### Critério de aceite S4

- [x] API detalhe com variantes
- [x] UI seletor + troca foto/preço
- [x] Lista com «a partir de»
- [x] Fluxo até checkout com `variant_id` no payload

---

## Próximo kickoff

Plano PV concluído em [`SPRINT_PV_S5_CHECKOUT_STOCK.md`](./SPRINT_PV_S5_CHECKOUT_STOCK.md).
