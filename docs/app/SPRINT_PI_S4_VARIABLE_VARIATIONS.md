# PI Sprint 4 — Produtos variable + variation

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S4** (feito) |
| **Plano-mãe** | [`PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md`](./PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md) |
| **Anterior** | [`SPRINT_PI_S3_IMPORT_EXECUTOR.md`](./SPRINT_PI_S3_IMPORT_EXECUTOR.md) |
| **Próximo** | **S5** — rehost de imagens + upsert por SKU |

---

## Entregas

| Artefato | Mudança |
|----------|---------|
| `importWooProductsCsv.ts` | Agrega `variable` + `variation` (`Ascendente`/`Parent` = `id:N`) |
| Testes | Fixture → **3** prepared; EN variable; órfãs; 11 testes OK |
| `ProductImportDialog` | Copy atualizada (simple + variável; PI13) |

### Regras (PI12 / PI13)

- Pai `variable` → 1 produto com `variations[{ name, values }]` a partir de `Nome/Valores do atributo N` (PT/EN).
- Filhas `variation` absorvidas (não aparecem como skip).
- `price` do pai = **menor** preço efetivo das variations.
- Sem persistir matriz `variation_prices` (limitação documentada na UI).
- Variation sem pai no arquivo → skip “órfã”.
- Estoque do pai: se vazio, soma estoques das filhas quando houver.

---

## Critério de aceite S4

- [x] Variable + variations da fixture → 1 item com atributo Cor e `price=69.90`
- [x] Simple continua funcionando
- [x] Órfãs reportadas
- [x] Testes passando
- [x] Preview/relatório refletem variáveis

---

## Próximo kickoff

Em chat: **`ok sprint 5`** — rehost de imagens + upsert por SKU + hardening.
