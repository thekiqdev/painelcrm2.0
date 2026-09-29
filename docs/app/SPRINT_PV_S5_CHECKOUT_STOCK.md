# PV Sprint 5 — Pedido + estoque + hardening

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S5** (feito) |
| **Plano-mãe** | [`PLANO_VARIANTES_PRODUTO.md`](./PLANO_VARIANTES_PRODUTO.md) |
| **Anterior** | [`SPRINT_PV_S4_STOREFRONT_VARIANTS.md`](./SPRINT_PV_S4_STOREFRONT_VARIANTS.md) |
| **Status do plano PV** | **S0–S5 concluídas** |

---

## Entregas

| Artefato | Path / mudança |
|----------|----------------|
| Baixa atômica | `productInventoryService.ts` — `decrementInventoryForCheckout` + `FOR UPDATE` |
| Checkout | `storePublicCheckoutService.ts` — pré-check 409 + baixa na mesma txn do pedido |
| Mídia | `deleteProduct` + `updateProduct` limpam URLs de variantes removidas |
| Sync | `syncProductVariants` devolve `deletedImageUrls` |
| UX | `ProductForm` — confirmação simples↔variável |
| Testes | `productInventoryService.test.ts` (hasEnoughStock + mocks de baixa) |

### Comportamento (PV15)

1. Pré-check de estoque antes de abrir a txn (variante ou pai).
2. Dentro da txn: `FOR UPDATE` no produto (e na variante); 409 se insuficiente.
3. `track_inventory=false` → não bloqueia nem altera estoque.
4. Variável: decrementa variante e recalcula `products.stock_quantity` = soma das ativas.
5. Snapshot `selected_variation` + `order_items.variant_id` já na S4; mantidos.
6. Delete do produto e remoção de linhas da grade → `unlinkStoredProductImageUrls` das fotos de variante.

### Critério de aceite S5

- [x] Pedido reduz estoque da variante (e sync do pai)
- [x] Simples com `track_inventory` baixa no pai
- [x] `track_inventory=false` não bloqueia venda
- [x] Limpeza de mídia no delete / sync de grade
- [x] Confirmação ao trocar modo Simples ↔ Variável
- [x] Plano PV marcado concluído

---

## Plano PV

**S0–S5 fechadas.** Critério de pronto do plano atendido na checklist do plano-mãe.
