# PI Sprint 2 — Parser WooCommerce (produtos simple)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S2** (feito) |
| **Plano-mãe** | [`PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md`](./PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md) |
| **Anterior** | [`SPRINT_PI_S1_IMPORT_DIALOG.md`](./SPRINT_PI_S1_IMPORT_DIALOG.md) |
| **Próximo** | **S3** — executor create + relatório |

---

## Entregas

| Artefato | Path |
|----------|------|
| Parser | `src/utils/importWooProductsCsv.ts` — `prepareWooProductsFromCsv` |
| Testes | `src/utils/importWooProductsCsv.test.ts` (9 casos, fixture real) |
| Preview UI | `ProductImportDialog` — passo preview com contagens + amostra |

### Comportamento do parser

- CSV RFC 4180 (multilinha / aspas), headers **PT e EN**.
- Só prepara `Tipo=simple` → payload `type:'product'` + `status` / `is_public` (PI5).
- Skip explícito: `variable`, `variation`, `grouped`, `external`, preço inválido, sem nome, limite 500.
- Preço BR (`199,99`), categoria (1º segmento / folha `A > B`), imagens URL (máx. 10), HTML → texto.

### Preview no dialog

Após **Continuar**: mostra N simple prontos, M pulados, lista amostra — **ainda sem create** (S3).

Callback `onPreviewReady` disponível para o executor da S3.

---

## Critério de aceite S2

- [x] `prepareWooProductsFromCsv` com mapeamento simple
- [x] Fixture → 2 prepared + skips de variable/variation
- [x] Testes unitários passando
- [x] Dialog mostra preview parseado

---

## Próximo kickoff

Em chat: **`ok sprint 3`** — loop `createProduct` + relatório + fix status (PIA1).
