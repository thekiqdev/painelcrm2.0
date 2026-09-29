# PI Sprint 5 — Rehost de imagens + upsert por SKU + hardening

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S5** (feito) |
| **Plano-mãe** | [`PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md`](./PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md) |
| **Anterior** | [`SPRINT_PI_S4_VARIABLE_VARIATIONS.md`](./SPRINT_PI_S4_VARIABLE_VARIATIONS.md) |
| **Status do plano PI** | **S0–S5 concluídas** |

---

## Entregas

| Artefato | Mudança |
|----------|---------|
| `POST /api/catalog-media/import-from-url` | Baixa imagem remota (SSRF-safe) → catalog-media |
| `catalogMediaImportFromUrlService.ts` | Guard SSRF + redirects manuais + sniff MIME |
| `importCatalogImageFromUrl` (FE) | Cliente do endpoint |
| `productImportExecutor.ts` | Rehost opcional + upsert por SKU + cancelamento |
| `decodeWooCsvBuffer` | UTF-8 → fallback Latin-1 (PIA3) |
| `ProductImportDialog` | Checkboxes upsert/rehost; cancelar; relatório created/updated |

### Opções na UI (preview)

1. **Atualizar existentes pelo SKU** (default **ligado**) — match case-insensitive; sem SKU → sempre cria.
2. **Baixar e hospedar imagens no catálogo** (default **desligado**) — em falha de uma URL, mantém a externa.

### Hardening

- Cancelamento via `AbortController` (itens já gravados ficam).
- Encoding CSV com fallback Latin-1.
- SSRF: bloqueia localhost / IPs privados / `.local` / `.internal`; redirects revalidados.

---

## Critério de aceite S5

- [x] Rehost via backend com proteção SSRF
- [x] Upsert por SKU idempotente
- [x] Opções na UI + cancelamento
- [x] Encoding fallback
- [x] Testes FE + BE
- [x] Plano-mãe atualizado (todas as sprints Feito)

---

## Como usar

1. Catálogo → **Importar** → CSV WooCommerce → Continuar  
2. Marcar opções desejadas → **Importar N produtos**  
3. Relatório: criados / atualizados / falhas  
