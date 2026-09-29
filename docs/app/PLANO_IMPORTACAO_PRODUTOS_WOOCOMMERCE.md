# Plano — Importação de produtos (WooCommerce CSV → Catálogo)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Tipo** | Plano de implementação (produto + UX + sprints) |
| **Nome** | **PI — Product Import** (importação de catálogo) |
| **Escopo** | Botão **Importar** em Catálogo (`/admin/products`), com provedor **WooCommerce** no MVP; arquitetura aberta a outros formatos depois |
| **Base** | Catálogo atual (`products`, `Products.tsx`, `ProductForm.tsx`) · padrão CSV de Clientes (`importClientsCsv.ts`) · export WC exemplo `wc-product-export-28-9-2026-*.csv` |
| **Fora de escopo (MVP)** | Shopify / Magento / Nuvemshop · sync bidirecional · API WooCommerce REST · edição em massa pós-import · categorias hierárquicas como entidade |
| **Princípio** | Reusar o fluxo **parse local → preview/relatório → create via API** já usado em Clientes/Contratos; **não** inventar pipeline paralelo no backend no MVP (salvo se imagens remotas exigirem proxy) |
| **Atualizado** | 2026-09-28 — Sprint 0–5 **concluídas** |
| **Status** | **Todas as sprints feitas** (MVP + variáveis + rehost/upsert) |
| **Kickoff** | — |

| Sprint | Foco | Status |
|--------|------|--------|
| **Sprint 0** | Decisões, mapeamento WC→`products`, fixture mínima, inventário UI/API | **Feito** ([`SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md)) |
| **Sprint 1** | UI: botão **Importar** + seletor de origem (só WooCommerce) + shell do diálogo | **Feito** ([`SPRINT_PI_S1_IMPORT_DIALOG.md`](./SPRINT_PI_S1_IMPORT_DIALOG.md)) |
| **Sprint 2** | Parser CSV WooCommerce (PT/EN) + produtos **simple** → payload `products` | **Feito** ([`SPRINT_PI_S2_WOO_PARSER_SIMPLE.md`](./SPRINT_PI_S2_WOO_PARSER_SIMPLE.md)) |
| **Sprint 3** | Executor de import + relatório (criados / pulados / erros) + empty-state | **Feito** ([`SPRINT_PI_S3_IMPORT_EXECUTOR.md`](./SPRINT_PI_S3_IMPORT_EXECUTOR.md)) |
| **Sprint 4** | Produtos **variable** + **variation** (atributos / variações) | **Feito** ([`SPRINT_PI_S4_VARIABLE_VARIATIONS.md`](./SPRINT_PI_S4_VARIABLE_VARIATIONS.md)) |
| **Sprint 5** | Imagens remotas (opcional rehost) + upsert por SKU + hardening | **Feito** ([`SPRINT_PI_S5_REHOST_UPSERT.md`](./SPRINT_PI_S5_REHOST_UPSERT.md)) |

---

## 1. Meta

Permitir que o admin do tenant, na tela **Catálogo**, importe produtos a partir do **arquivo de exportação CSV do WooCommerce** (Produtos → Exportar), sem cadastrar item a item.

**Objetivo do MVP**

1. Botão **Importar** ao lado de “Novo item” / no empty-state.
2. Ao clicar, escolher origem — **por enquanto só WooCommerce** (UI já preparada para “outras opções em breve”).
3. Selecionar o `.csv`, validar cabeçalhos, importar e ver relatório.
4. Itens criados como `type: 'product'` no catálogo atual, utilizáveis na loja pública.

**Não-objetivo do MVP:** manter sync contínuo com a loja Woo; importar pedidos/clientes WC; API REST do Woo.

---

## 2. Diagnóstico — como está hoje

| Peça | Estado atual | Gap |
|------|--------------|-----|
| Catálogo admin | `src/pages/Products.tsx` — listagem + Novo item + Configurar Loja | Sem Importar |
| CRUD produtos | `POST/PATCH /api/products` + Zod `productSchema` | Sem endpoint de import em lote |
| Campos | `name`, `short_description`, `description`, `price`, `discount_price`, `sku`, `stock_*`, `category`, `images[]`, `secondary_images[]`, `variations[]`, `status`, `is_public`, … | `pricing_mode` / `variation_prices` existem no front e **não persistem** no backend |
| Import CSV (padrão) | Clientes, leads, contratos, projetos, pagamentos — parse no browser + loop `create` | Reutilizar em produtos |
| Mídia | Upload `catalog-media` → URLs assinadas em JSONB | CSV WC traz **URLs externas** (site de origem) |
| Categorias | `category` texto livre | WC usa string (ex.: `Bonés`, `Bolsas`); hierarquia `Pai > Filho` pode aparecer em outros exports |

### 2.1 Amostra do CSV de referência (fato)

Arquivo: export WooCommerce PT-BR (~101 linhas úteis, 87 colunas).

| Tipo WC | Qtde (amostra) | Uso |
|---------|----------------|-----|
| `simple` | 32 | Produto simples → 1 registro `products` |
| `variable` | 18 | Pai com atributos → 1 registro + `variations` |
| `variation` | 51 | Filho (`Ascendente` = `id:<parentId>`) → preço/estoque/imagem por variação |

Cabeçalhos observados (PT): `ID`, `Tipo`, `SKU`, `Nome`, `Publicado`, `Descrição curta`, `Descrição`, `Em estoque?`, `Estoque`, `Quantidade baixa de estoque`, `Preço`, `Preço promocional`, `Categorias`, `Imagens`, `Ascendente`, `Nome do atributo 1`, `Valores do atributo 1`, …

- Preço no formato BR: `199,99`
- `Publicado`: `1` / `0`
- Imagens: URLs absolutas separadas por `, `
- Variações ligadas por `Ascendente` = `id:1970`

---

## 3. Decisões de produto (fechadas — Sprint 0)

Detalhe + complementares (PIA1–PIA5): [`SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md).

| ID | Tema | Fechado |
|----|------|---------|
| **PI1** | Onde fica o botão | Header de `Products.tsx` (outline) + empty-state |
| **PI2** | UX da origem | Dialog: **WooCommerce** habilitado; demais “Em breve” |
| **PI3** | Onde parseia | **Cliente** — `prepareWooProductsFromCsv` |
| **PI4** | Escopo de tipos | S2–S3: `simple`. S4: `variable`+`variation`. Skip `grouped`/`external` |
| **PI5** | `Publicado` | `1` → `active`+público; `0` → `draft`+não público |
| **PI6** | Preço | `Preço`→`price`; promocional→`discount_price`; parse BR |
| **PI7** | Estoque | Mapear se preenchido; vazio **não** vira `0` |
| **PI8** | Categoria | 1º segmento; hierarquia `A > B` → folha `B` |
| **PI9** | Imagens MVP | URLs externas no JSONB; rehost na S5 |
| **PI10** | HTML | Strip tags → texto plano |
| **PI11** | Duplicidade | MVP sempre criar; upsert SKU na S5 |
| **PI12** | Variações | Atributos do pai → `variations[{name,values}]` |
| **PI13** | Preço variável | **Opção B:** `price` = min das variations; sem persistir `variation_prices` |
| **PI14** | Limite | Soft-limit 500 produtos finais + progresso; sem job async |
| **PI15** | Permissão | Módulo `products` **create** |
| **PI16** | Feature flag | Sem flag dedicada; gated pelo módulo `products` |

---

## 4. Mapeamento WooCommerce → `products`

### 4.1 Produto simple

| CSV WooCommerce (PT) | Campo destino | Notas |
|----------------------|---------------|-------|
| `Nome` | `name` | Obrigatório; skip se vazio |
| `Descrição curta` | `short_description` | |
| `Descrição` | `description` | HTML → texto (PI10) |
| `Tipo` | `type` | Sempre `'product'` |
| `SKU` | `sku` | |
| `Preço` | `price` | Decimal BR |
| `Preço promocional` | `discount_price` | |
| `Estoque` | `stock_quantity` | |
| `Quantidade baixa de estoque` | `min_stock_quantity` | |
| `Categorias` | `category` | PI8 |
| `Imagens` | `images[0]` + `secondary_images` / resto de `images` | 1ª = capa; demais galeria (limite atual do form ~10) |
| `Publicado` | `status` / `is_public` | PI5 |
| `ID` | metadado interno do parse | Só para ligar variations; **não** vira UUID nosso |
| — | `currency` | `BRL` |
| — | `features` / contrato / recorrência | vazio / false |

### 4.2 Variable + variation (Sprint 4)

| Fonte | Destino |
|-------|---------|
| Linha `variable` | Produto pai: nome, desc, cats, imagens, `variations` a partir de `Nome do atributo N` + `Valores do atributo N` (split `,`) |
| Linhas `variation` com `Ascendente = id:<parentId>` | Agregar preços/estoque; montar combinações (`Valores do atributo N`) |
| Preço das variations | Conforme PI13 |

Ignorar no MVP (skip com motivo): `grouped`, `external` / afiliado, linhas `variation` sem pai no arquivo.

### 4.3 Cabeçalhos EN (compat)

Aceitar também export em inglês (`Type`, `Name`, `Published`, `Short description`, `Description`, `In stock?`, `Stock`, `Sale price`, `Regular price`, `Categories`, `Images`, `Parent`, `Attribute 1 name`, `Attribute 1 value(s)`, …) via tabela de sinônimos no parser (mesmo padrão de `normalizeHeaderKey` dos outros imports).

---

## 5. UX proposta

```
[Catálogo]                    [Importar ▾] [Configurar Loja] [Novo item]
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │ Importar produtos               │
                    │                                 │
                    │ Origem                          │
                    │  ● WooCommerce (CSV)            │
                    │  ○ Shopify        (Em breve)    │
                    │  ○ Outros         (Em breve)    │
                    │                                 │
                    │ [Escolher arquivo .csv]         │
                    │ Dica: Woo → Produtos → Exportar │
                    │                                 │
                    │ [Cancelar]  [Continuar]         │
                    └─────────────────────────────────┘
                                    │
                                    ▼
                    Preview: N válidos, M pulados
                    [Importar N produtos]
                                    │
                                    ▼
                    Relatório: criados / falhas / skips
```

- Reusar padrões visuais do dialog de import de **Clientes**.
- Durante o import: barra/contador “42 / 80”.
- Não bloquear a listagem inteira além de disable do botão.

---

## 6. Arquitetura técnica (MVP)

```
Products.tsx
  └─ ProductImportDialog
        ├─ provider = 'woocommerce' | 'shopify'(disabled) | …
        ├─ file → text
        └─ prepareWooProductsFromCsv(text)  // src/utils/importWooProductsCsv.ts
              → { prepared[], skipped[] }
        └─ loop productsService.createProduct(payload)
              → summary dialog
```

| Artefato | Caminho sugerido |
|----------|------------------|
| Parser + prepare | `src/utils/importWooProductsCsv.ts` (+ testes) |
| Dialog UI | `src/components/products/ProductImportDialog.tsx` |
| Integração | `src/pages/Products.tsx` |
| Fixture mínima | `src/utils/__fixtures__/woo-products-sample.csv` (**criada na S0**) |
| Doc sprint | [`SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md) + closeouts seguintes |

**Backend no MVP:** nenhum endpoint novo, salvo se Sprint 5 optar por `POST /api/catalog-media/import-from-url` (proxy/rehost) para contornar CORS/hotlink.

---

## 7. Sprints detalhadas

### Sprint 0 — Inventário e decisões — **Feito** (2026-09-28)

- PI1–PI16 + PIA1–PIA5 fechados.
- Fixture: `src/utils/__fixtures__/woo-products-sample.csv`.
- Closeout: [`SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PI_S0_INVENTORY_AND_DECISIONS.md).

### Sprint 1 — Botão + shell do import — **Feito** (2026-09-28)

- `ProductImportDialog` + botão no header/empty-state de `Products.tsx`.
- Closeout: [`SPRINT_PI_S1_IMPORT_DIALOG.md`](./SPRINT_PI_S1_IMPORT_DIALOG.md).

### Sprint 2 — Parser simple — **Feito** (2026-09-28)

- `importWooProductsCsv.ts` + testes + preview no dialog.
- Closeout: [`SPRINT_PI_S2_WOO_PARSER_SIMPLE.md`](./SPRINT_PI_S2_WOO_PARSER_SIMPLE.md).

### Sprint 3 — Executor + relatório — **Feito** (2026-09-28)

- Import real + progresso + relatório; PIA1 (`status` no create).
- Closeout: [`SPRINT_PI_S3_IMPORT_EXECUTOR.md`](./SPRINT_PI_S3_IMPORT_EXECUTOR.md).
- **MVP simple utilizável.**

### Sprint 4 — Variable / variation — **Feito** (2026-09-28)

- Agrega variations no pai; `price` = min; `variations[]` com atributos (PI13).
- Closeout: [`SPRINT_PI_S4_VARIABLE_VARIATIONS.md`](./SPRINT_PI_S4_VARIABLE_VARIATIONS.md).

### Sprint 5 — Imagens, upsert, hardening — **Feito** (2026-09-28)

- `POST /api/catalog-media/import-from-url` · upsert SKU · encoding · cancelamento.
- Closeout: [`SPRINT_PI_S5_REHOST_UPSERT.md`](./SPRINT_PI_S5_REHOST_UPSERT.md).
- **Plano PI completo (S0–S5).**

---

## 8. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| CSV com campos multilinha / aspas | Parser igual ao de Clientes (`splitCsvRows` + `parseCsvLine`); cobrir com fixture |
| Encoding (`utf-8-sig`, Latin-1) | Tentar UTF-8 BOM; fallback Latin-1 se headers quebrarem |
| Hotlink de imagem bloqueado | MVP aceita URL externa; Sprint 5 rehost |
| Variações sem persistência de preço por combinação | Fechar PI13 antes da Sprint 4; não prometer paridade total com WC |
| Arquivo grande (milhares de linhas) | Soft-limit + progresso; job async só se necessário depois |
| CSV comercial no repositório | **Não** versionar o export completo do cliente; só fixture mínima |

---

## 9. Extensibilidade (pós-MVP)

| Provedor | Formato típico | Nota |
|----------|----------------|------|
| Shopify | CSV produtos | Novo `prepareShopifyProductsFromCsv` + habilitar no dialog |
| Nuvemshop / Tray | CSV ou XLSX | Mesmo contrato `PreparedProductRow` |
| Planilha genérica Platform | CSV template nosso | Exportar modelo + import |
| Woo REST API | JSON paginado | Outro fluxo (OAuth); não misturar com CSV |

Contrato interno sugerido:

```ts
type ProductImportProvider = 'woocommerce' | 'shopify' | 'generic';

type PreparedProductImportRow = {
  lineNumber: number;
  sourceType: 'simple' | 'variable';
  payload: /* CreateProduct input */;
  meta?: { externalId?: string; sku?: string };
};
```

---

## 10. Critério de pronto do MVP (fim Sprint 3) — **atingido**

- [x] Botão **Importar** visível em Catálogo (lista e empty-state).
- [x] Origem WooCommerce funcional; outras desabilitadas com “Em breve”.
- [x] CSV WC PT (e headers EN básicos) importa produtos **simple**.
- [x] Relatório claro de criados / pulados / erros.
- [x] Itens aparecem no admin e, se `is_public`/`active`, na loja (URLs externas).
- [x] Fixture + testes do parser no repo.
- [x] Este plano atualizado com status das sprints.

**MVP estendido (Sprint 4–5):** variáveis + rehost/upsert — **entregue**.

---

## 11. Ordem sugerida de kickoff

1. `ok sprint 0` — fechar decisões (especialmente imagens e variações).
2. `ok sprint 1` — botão + dialog.
3. `ok sprint 2` — parser simple.
4. `ok sprint 3` — import real + relatório → **MVP utilizável**.
5. `ok sprint 4` / `ok sprint 5` — conforme prioridade da loja com muitos variáveis.

---

## 12. Referências

- UI catálogo: `src/pages/Products.tsx`, `src/pages/ProductForm.tsx`
- Tipos: `src/types/products.ts`
- API: `packages/backend/src/controllers/productsController.ts`
- Padrão import: `src/utils/importClientsCsv.ts`, `src/pages/Clients.tsx`
- Evolução catálogo: [`PLANO_EVOLUCAO_MODULO_CATALOGO.md`](./PLANO_EVOLUCAO_MODULO_CATALOGO.md)
- Diagnóstico: [`../contexto/DIAGNOSTICO_MODULO_PRODUTOS_SERVICOS.md`](../contexto/DIAGNOSTICO_MODULO_PRODUTOS_SERVICOS.md)
