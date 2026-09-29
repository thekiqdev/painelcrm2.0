# PI Sprint 1 — Botão Importar + shell do diálogo

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S1** (feito) |
| **Plano-mãe** | [`PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md`](./PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md) |
| **Anterior** | [`SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md) |
| **Próximo** | **S2** — `prepareWooProductsFromCsv` (produtos simple) |

---

## Entregas

| Artefato | Path |
|----------|------|
| Dialog | `src/components/products/ProductImportDialog.tsx` |
| Integração | `src/pages/Products.tsx` — botão header + empty-state |

### Comportamento

1. Botão **Importar** (outline) no header do Catálogo e no empty-state.
2. Dialog com origens:
   - **WooCommerce (CSV)** — habilitado
   - Shopify / Outros — disabled + badge “Em breve”
3. Seleção de arquivo `.csv` / `.txt`; validação de extensão/MIME.
4. **Continuar** lê o texto do arquivo; passo “Arquivo pronto” (sem parse/create ainda).
5. Callback opcional `onFileReady` reservado para S2+ ligar o parser.

### Fora desta sprint (como planejado)

- Parser / mapeamento de colunas → **S2**
- Create em lote + relatório → **S3**

---

## Critério de aceite S1

- [x] Botão Importar no header e empty-state
- [x] Só WooCommerce habilitado; outras origens visíveis como “Em breve”
- [x] Input file CSV com validação básica
- [x] Shell utilizável sem criar produtos
- [x] Hook `onFileReady` pronto para S2

---

## Próximo kickoff

Em chat: **`ok sprint 2`** — parser WooCommerce PT/EN + produtos `simple`.
