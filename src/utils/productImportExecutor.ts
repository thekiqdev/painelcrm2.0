import type { Product } from "@/types/products";
import { importCatalogImageFromUrl } from "@/services/catalogMediaUpload";
import { productsService } from "@/services/products";
import {
  normalizeProductSkuKey,
  type WooCsvImportPreparedRow,
  type WooCsvImportSkip,
  type WooProductImportPayload,
} from "@/utils/importWooProductsCsv";

export type ProductImportFailure = {
  line: number;
  name?: string;
  message: string;
};

export type ProductImportSummary = {
  created: number;
  updated: number;
  failed: ProductImportFailure[];
  skipped: WooCsvImportSkip[];
  cancelled?: boolean;
};

export type ProductImportRunOptions = {
  rehostImages: boolean;
  upsertBySku: boolean;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  batchSize?: number;
};

const DEFAULT_BATCH = 3;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error("Importação cancelada.");
    err.name = "AbortError";
    throw err;
  }
}

/** Troca URLs externas por URLs do catálogo; em falha mantém a URL original. */
export async function rehostProductImages(
  payload: WooProductImportPayload,
  signal?: AbortSignal,
): Promise<WooProductImportPayload> {
  const images = payload.images ?? [];
  if (images.length === 0) return payload;

  const nextImages: string[] = [];
  for (const url of images) {
    throwIfAborted(signal);
    if (!/^https?:\/\//i.test(url)) {
      nextImages.push(url);
      continue;
    }
    // Já hospedada no nosso catálogo / media
    if (url.includes("/api/public/catalog-media/") || url.includes("/api/media/v1/raw")) {
      nextImages.push(url);
      continue;
    }
    try {
      const hosted = await importCatalogImageFromUrl(url, "product");
      nextImages.push(hosted);
    } catch {
      nextImages.push(url);
    }
  }
  return { ...payload, images: nextImages };
}

export function buildSkuIndex(products: Product[]): Map<string, Product> {
  const map = new Map<string, Product>();
  for (const p of products) {
    const key = normalizeProductSkuKey(p.sku);
    if (!key || map.has(key)) continue;
    map.set(key, p);
  }
  return map;
}

/**
 * Executa create/update em lote com opções S5 (rehost + upsert por SKU).
 */
export async function runWooProductImport(
  rows: WooCsvImportPreparedRow[],
  skipped: WooCsvImportSkip[],
  options: ProductImportRunOptions,
): Promise<ProductImportSummary> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const failed: ProductImportFailure[] = [];
  let created = 0;
  let updated = 0;
  let done = 0;
  let cancelled = false;

  let skuIndex = new Map<string, Product>();
  if (options.upsertBySku) {
    const existing = await productsService.getProducts();
    skuIndex = buildSkuIndex(existing);
  }

  try {
    for (let i = 0; i < rows.length; i += batchSize) {
      throwIfAborted(options.signal);
      const chunk = rows.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (row) => {
          try {
            throwIfAborted(options.signal);
            let payload = row.payload;
            if (options.rehostImages) {
              payload = await rehostProductImages(payload, options.signal);
            }

            const skuKey = normalizeProductSkuKey(payload.sku);
            const match = options.upsertBySku && skuKey ? skuIndex.get(skuKey) : undefined;

            if (match) {
              await productsService.updateProduct(match.id, payload);
              updated += 1;
            } else {
              const createdProduct = await productsService.createProduct(payload);
              created += 1;
              if (options.upsertBySku && skuKey) {
                skuIndex.set(skuKey, createdProduct);
              }
            }
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              cancelled = true;
              return;
            }
            failed.push({
              line: row.lineNumber,
              name: row.payload.name,
              message: err instanceof Error ? err.message : String(err ?? "Erro ao importar"),
            });
          } finally {
            done += 1;
            options.onProgress?.(done, rows.length);
          }
        }),
      );
      if (cancelled || options.signal?.aborted) {
        cancelled = true;
        break;
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      cancelled = true;
    } else {
      throw err;
    }
  }

  return { created, updated, failed, skipped, cancelled };
}
