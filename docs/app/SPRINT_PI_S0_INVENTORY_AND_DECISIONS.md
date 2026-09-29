# PI Sprint 0 — Inventário + decisões + fixture

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S0** (feito) |
| **Plano-mãe** | [`PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md`](./PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md) |
| **Próximo** | **S1** — botão Importar + shell do diálogo (WooCommerce) |

---

## Entregas

1. Decisões **PI1–PI16** fechadas (abaixo).
2. Fixture mínima no repo: [`src/utils/__fixtures__/woo-products-sample.csv`](../../src/utils/__fixtures__/woo-products-sample.csv)  
   - 1 `variable` + 2 `variation` + 2 `simple`  
   - Colunas core (sem `Metadado:*`)  
   - Marca/URLs anonimizadas (`DEMO BRAND`, `example.com`)
3. Checklist de colunas e inventário de entrypoints (este doc).

---

## Decisões fechadas (ADR curto)

| ID | Decisão |
|----|---------|
| **PI1** | Botão **Importar** no header de `Products.tsx` (outline) **e** no empty-state |
| **PI2** | Dialog com lista de origens; **WooCommerce** habilitado; Shopify/outros = disabled “Em breve” |
| **PI3** | Parse **no cliente** (`prepareWooProductsFromCsv`); create via `POST /api/products` em loop |
| **PI4** | S2–S3: só `simple`. S4: `variable`+`variation`. Skip `grouped` / `external` com motivo |
| **PI5** | `Publicado=1` → `status:'active'` + `is_public:true`; `0` → `draft` + `is_public:false` |
| **PI6** | `Preço` → `price`; `Preço promocional` → `discount_price`; parse decimal BR (`1.234,56` / `69,90`) |
| **PI7** | `Estoque` → `stock_quantity`; baixa → `min_stock_quantity`; célula vazia **não** vira `0` |
| **PI8** | `Categorias`: 1º segmento antes de `,`; se `A > B`, usar folha `B` |
| **PI9** | MVP: persistir **URLs externas** em `images` / `secondary_images`. Rehost = S5 |
| **PI10** | Descrição: **strip tags HTML** → texto plano; não guardar HTML bruto para render |
| **PI11** | MVP: sempre **criar** (sem dedupe). Upsert por SKU = S5 |
| **PI12** | Pai `variable` → `variations[{ name, values }]` a partir dos atributos N do CSV |
| **PI13** | **Opção B:** `price` do produto = **menor** preço das variations com preço; `variations` persistem atributos; **não** persistir matriz `variation_prices` até evolução de schema (campo front-only hoje). Documentar limitação na UI do relatório S4 |
| **PI14** | Soft-limit **500** linhas de produto final (simple + variable pais); progresso na UI; sem job async |
| **PI15** | Permissão = módulo `products` **create** (mesmo do formulário) |
| **PI16** | **Sem flag dedicada** no MVP — gated só por feature/módulo `products` já existente. Flag `products.import_woocommerce_v1` só se surgir necessidade de rollout gradual |

### Complementares fechados nesta S0

| ID | Tema | Fechado |
|----|------|---------|
| **PIA1** | `createProduct` no client força `status: 'active'` | Em **S3**, o executor de import deve enviar o `status` do payload (ajustar `ProductsService.createProduct` para **não sobrescrever** quando `status` vier explícito, ou usar POST raw). Sem isso PI5 quebra para `Publicado=0` |
| **PIA2** | 1ª URL de `Imagens` | → `images[0]` (capa); demais → restante de `images` (até limite prático 10); `secondary_images` fica `[]` no MVP (evita duplicar modelo legado) |
| **PIA3** | Encoding | Preferir UTF-8 com BOM (`utf-8-sig`); se headers WC não baterem, tentar Latin-1 uma vez |
| **PIA4** | Fixture no repo | Apenas sample anonimizado; **não** versionar export comercial completo do cliente |
| **PIA5** | Tipo de item | Import WC sempre `type: 'product'` (nunca `service`) |

---

## Inventário — entrypoints atuais

### Admin catálogo

| Camada | Path |
|--------|------|
| Página lista | `src/pages/Products.tsx` — `/admin/products` |
| Form create/edit | `src/pages/ProductForm.tsx` |
| Service | `src/services/products.ts` → `createProduct` / `getProducts` |
| Tipos | `src/types/products.ts` |

**S1:** inserir botão + `ProductImportDialog` aqui.

### API produtos

| Método | Rota | Notas |
|--------|------|-------|
| `POST` | `/api/products` | Zod `productSchema`; aceita `variations` JSONB; **não** aceita `pricing_mode` / `variation_prices` |
| `GET` | `/api/products` | Lista tenant |
| Permissão | `assertModulePermission(..., 'products', 'create')` | |

Controller: `packages/backend/src/controllers/productsController.ts`.

### Padrão de import a espelhar

| Peça | Referência |
|------|------------|
| Parser CSV | `src/utils/importClientsCsv.ts` (`parseCsvLine`, `splitCsvRows`, `normalizeHeaderKey`) |
| UI | `src/pages/Clients.tsx` — input file + dialog de resumo |
| Novo parser | `src/utils/importWooProductsCsv.ts` (S2) |
| Novo dialog | `src/components/products/ProductImportDialog.tsx` (S1) |

### Mídia

| Peça | Estado |
|------|--------|
| Upload interno | `POST /api/catalog-media/upload` |
| Import MVP | URLs remotas no JSONB (PI9) — vitrine depende de hotlink |
| S5 | Endpoint ou fluxo rehost (a definir) |

---

## Checklist de colunas WooCommerce

### Obrigatórias para importar uma linha `simple` / pai `variable`

| Coluna PT | EN aceito | Regra |
|-----------|-----------|-------|
| `Nome` | `Name` | Não vazio |
| `Tipo` | `Type` | `simple` \| `variable` \| `variation` (outros → skip) |

### Usadas quando presentes

| Coluna PT | Destino / uso |
|-----------|----------------|
| `ID` | Só para ligar `variation` → pai (`Ascendente` = `id:<ID>`); descartado após parse |
| `SKU` | `sku` |
| `Publicado` | `status` / `is_public` (PI5) |
| `Descrição curta` | `short_description` (HTML stripped) |
| `Descrição` | `description` (HTML stripped) |
| `Preço` | `price` (ou min das variations no pai) |
| `Preço promocional` | `discount_price` |
| `Estoque` | `stock_quantity` |
| `Quantidade baixa de estoque` | `min_stock_quantity` |
| `Em estoque?` | Informativo; não cria campo próprio |
| `Categorias` | `category` (PI8) |
| `Imagens` | `images[]` (PIA2) |
| `Ascendente` / `Parent` | Link variation → variable |
| `Nome do atributo N` | `variations[n].name` |
| `Valores do atributo N` | `variations[n].values` (split `,`) |

### Ignoradas no MVP (não bloqueiam)

Imposto, peso/dimensões, tags, upsells, cross-sells, download, URL externa, marcas, todos `Metadado:*`, destaque, classe de entrega, avaliações, etc.

### Tipos com skip explícito

| Tipo | Motivo no relatório |
|------|---------------------|
| `grouped` | Não suportado no MVP |
| `external` / afiliado | Não suportado no MVP |
| `variation` sem pai no arquivo | Órfã |
| `variation` (S2–S3) | Ainda fora do escopo até S4 — contar como skip “variação (aguardando S4)” **ou** ignorar silenciosamente no prepare se o pai também não for importado; **S2:** skip variation com motivo claro |

---

## Fixture

**Arquivo:** `src/utils/__fixtures__/woo-products-sample.csv`

| ID | Tipo | Nome (demo) | Preço | Notas |
|----|------|-------------|-------|-------|
| 1970 | variable | Boné DEMO BRAND — SIGNATURE CAP | (vazio) | Atributo Cor: 5 valores |
| 1976 | variation | … Azul claro | 69,90 | `Ascendente=id:1970` |
| 1977 | variation | … Branco | 69,90 | idem |
| 2020 | simple | BAG FIT FORCE MULTIFUNCIONAL | 199,99 | Cat. Bolsas |
| 2030 | simple | BOLSA TOTE | 189,99 | Cat. Bolsas |

Expectativa S2 prepare (só simple): **2** prepared, variations/variable em skipped.  
Expectativa S4: **3** produtos finais (2 simple + 1 variable com `variations` Cor e `price=69.90`).

---

## Riscos confirmados nesta S0

| Risco | Ação |
|-------|------|
| `ProductsService.createProduct` força `status:'active'` | Corrigir na S3 (PIA1) |
| `variation_prices` não persiste | PI13 opção B; sem migration na S4 |
| Hotlink de imagem | Aceito no MVP (PI9); S5 rehost |
| CSV multilinha / aspas | Reusar parser RFC4180 dos clients; fixture já tem `\n` em descrições |

---

## Critério de aceite S0 — checklist

- [x] PI1–PI16 + PIA1–PIA5 fechados neste doc e no plano-mãe
- [x] Fixture mínima no repo (anonimizada)
- [x] Checklist de colunas obrigatórias / usadas / ignoradas
- [x] Inventário de UI/API/padrão de import
- [x] Plano-mãe com Sprint 0 = **Feito** e link para este closeout

---

## Próximo kickoff

Em chat: **`ok sprint 1`** — botão Importar + `ProductImportDialog` (WooCommerce only).
