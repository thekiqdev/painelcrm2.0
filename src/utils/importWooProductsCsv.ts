import type { ProductFormData, ProductVariation } from "@/types/products";

export type WooProductImportPayload = ProductFormData & {
  status: "active" | "inactive" | "draft";
};

export type WooCsvImportPreparedRow = {
  lineNumber: number;
  sourceType: "simple" | "variable";
  externalId?: string;
  /** Linhas de variation absorvidas neste produto (S4). */
  variationLineNumbers?: number[];
  payload: WooProductImportPayload;
};

export type WooCsvImportSkip = {
  line: number;
  reason: string;
};

/** Soft-limit PI14 — produtos finais preparados por arquivo. */
export const WOO_IMPORT_MAX_PREPARED = 500;

const MAX_IMAGES = 10;

type ColumnRole =
  | "id"
  | "type"
  | "sku"
  | "name"
  | "published"
  | "short_description"
  | "description"
  | "price"
  | "sale_price"
  | "stock"
  | "low_stock"
  | "categories"
  | "images"
  | "parent";

type AttrColumn = {
  index: number;
  nameCol: number;
  valuesCol: number;
};

type ParsedLine = {
  lineNumber: number;
  cells: string[];
  type: string;
  name: string;
  externalId?: string;
  parentId?: string;
};

function normalizeHeaderKey(s: string): string {
  return s
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/** Parser de linha CSV estilo RFC 4180 (campos entre aspas). */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      cur += c;
    } else if (!inQuotes && (c === "\n" || (c === "\r" && text[i + 1] === "\n"))) {
      if (c === "\r") i++;
      rows.push(cur);
      cur = "";
    } else if (!inQuotes && c === "\r") {
      rows.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows.filter((r) => r.trim().length > 0);
}

const HEADER_SYNONYMS: Record<string, ColumnRole | "ignore"> = {
  id: "id",
  tipo: "type",
  type: "type",
  sku: "sku",
  nome: "name",
  name: "name",
  publicado: "published",
  published: "published",
  "descricao curta": "short_description",
  "short description": "short_description",
  descricao: "description",
  description: "description",
  preco: "price",
  "regular price": "price",
  "preco promocional": "sale_price",
  "sale price": "sale_price",
  estoque: "stock",
  stock: "stock",
  "quantidade baixa de estoque": "low_stock",
  "low stock amount": "low_stock",
  categorias: "categories",
  categories: "categories",
  imagens: "images",
  images: "images",
  ascendente: "parent",
  parent: "parent",
};

function mapHeaderToRole(cell: string): ColumnRole | "ignore" {
  const key = normalizeHeaderKey(cell);
  const direct = HEADER_SYNONYMS[key];
  if (direct) return direct;
  if (key.startsWith("data de preco") || key.startsWith("date sale")) return "ignore";
  if (key === "preco" || key === "regular price") return "price";
  if (key.includes("preco promocional") || key === "sale price") return "sale_price";
  if (key === "short description" || key === "descricao curta") return "short_description";
  if (key === "descricao" || key === "description") return "description";
  return "ignore";
}

function detectAttributeColumns(headers: string[]): AttrColumn[] {
  const byIndex = new Map<number, { nameCol?: number; valuesCol?: number }>();
  headers.forEach((h, i) => {
    const key = normalizeHeaderKey(h);
    let m = key.match(/^nome do atributo (\d+)$/) || key.match(/^attribute (\d+) name$/);
    if (m) {
      const n = Number(m[1]);
      const cur = byIndex.get(n) ?? {};
      cur.nameCol = i;
      byIndex.set(n, cur);
      return;
    }
    m =
      key.match(/^valores do atributo (\d+)$/) ||
      key.match(/^attribute (\d+) value\(s\)$/) ||
      key.match(/^attribute (\d+) values$/);
    if (m) {
      const n = Number(m[1]);
      const cur = byIndex.get(n) ?? {};
      cur.valuesCol = i;
      byIndex.set(n, cur);
    }
  });
  return [...byIndex.entries()]
    .filter(([, v]) => v.nameCol != null && v.valuesCol != null)
    .sort((a, b) => a[0] - b[0])
    .map(([index, v]) => ({ index, nameCol: v.nameCol!, valuesCol: v.valuesCol! }));
}

/** Decimal BR (`1.234,56` / `69,90`) ou EN (`1234.56`). */
export function parseWooDecimal(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  let normalized = t.replace(/\s/g, "");
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    })
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseWooCategory(raw: string): string | undefined {
  const first = raw.split(",")[0]?.trim() ?? "";
  if (!first) return undefined;
  if (first.includes(">")) {
    const parts = first.split(">").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || undefined;
  }
  return first;
}

function parsePublished(raw: string): { status: "active" | "draft"; is_public: boolean } {
  const v = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s/g, "");
  if (!v || ["1", "sim", "yes", "true", "publicado", "publish"].includes(v)) {
    return { status: "active", is_public: true };
  }
  if (["0", "nao", "no", "false", "rascunho", "draft", "private"].includes(v)) {
    return { status: "draft", is_public: false };
  }
  return { status: "active", is_public: true };
}

function parseImageUrls(raw: string): string[] {
  if (!raw.trim()) return [];
  const urls = raw
    .split(",")
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  return urls.slice(0, MAX_IMAGES);
}

function normalizeType(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function parseOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

/** Cabeçalho WC reconhecível (Nome/Name + Tipo/Type). */
export function hasWooCsvHeaders(csvText: string): boolean {
  const rows = splitCsvRows(csvText);
  if (rows.length < 1) return false;
  const roles = parseCsvLine(rows[0]).map((h) => mapHeaderToRole(h.trim()));
  return roles.includes("name") && roles.includes("type");
}

/**
 * Decodifica buffer do CSV: UTF-8 (com BOM) e fallback Latin-1 se o cabeçalho WC não bater (PIA3).
 */
export function decodeWooCsvBuffer(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (hasWooCsvHeaders(utf8)) return utf8;
  const latin1 = new TextDecoder("iso-8859-1").decode(buf);
  if (hasWooCsvHeaders(latin1)) return latin1;
  return utf8;
}

export function normalizeProductSkuKey(sku: string | null | undefined): string {
  return (sku ?? "").trim().toLowerCase();
}

function parseAttributeValues(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `id:1970` ou `1970` → `1970`. */
export function parseWooParentRef(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const m = t.match(/^id:(\d+)$/i) || t.match(/^(\d+)$/);
  return m?.[1];
}

function buildVariationsFromCells(
  cells: string[],
  attrCols: AttrColumn[],
): ProductVariation[] {
  const out: ProductVariation[] = [];
  for (const col of attrCols) {
    const name = (cells[col.nameCol] ?? "").trim();
    const valuesRaw = (cells[col.valuesCol] ?? "").trim();
    if (!name || !valuesRaw) continue;
    const values = parseAttributeValues(valuesRaw);
    if (values.length === 0) continue;
    out.push({ name, values });
  }
  return out;
}

/** Une valores das variations filhas nos atributos do pai (PI12). */
function mergeVariationAttrsFromChildren(
  parentVars: ProductVariation[],
  children: ParsedLine[],
  attrCols: AttrColumn[],
  getCell: (cells: string[], col: number) => string,
): ProductVariation[] {
  if (attrCols.length === 0) return parentVars;

  const byName = new Map<string, Set<string>>();
  for (const v of parentVars) {
    byName.set(v.name, new Set(v.values));
  }

  for (const child of children) {
    for (const col of attrCols) {
      const name = getCell(child.cells, col.nameCol).trim();
      const valuesRaw = getCell(child.cells, col.valuesCol).trim();
      if (!name || !valuesRaw) continue;
      const set = byName.get(name) ?? new Set<string>();
      for (const val of parseAttributeValues(valuesRaw)) set.add(val);
      byName.set(name, set);
    }
  }

  return [...byName.entries()]
    .filter(([, values]) => values.size > 0)
    .map(([name, values]) => ({ name, values: [...values] }));
}

type PriceStockParse =
  | { ok: true; price?: number; discount_price?: number; stock_quantity?: number; min_stock_quantity?: number }
  | { ok: false; reason: string };

function parsePriceStockFields(
  get: (role: ColumnRole) => string,
): PriceStockParse {
  const priceRaw = get("price");
  const saleRaw = get("sale_price");
  let price = priceRaw ? parseWooDecimal(priceRaw) : undefined;
  let discount_price = saleRaw ? parseWooDecimal(saleRaw) : undefined;

  if (priceRaw && price === undefined) {
    return { ok: false, reason: `Preço inválido («${priceRaw}»).` };
  }
  if (saleRaw && discount_price === undefined) {
    return { ok: false, reason: `Preço promocional inválido («${saleRaw}»).` };
  }

  const stockRaw = get("stock");
  const lowStockRaw = get("low_stock");
  let stock_quantity: number | undefined;
  let min_stock_quantity: number | undefined;
  if (stockRaw) {
    stock_quantity = parseOptionalInt(stockRaw);
    if (stock_quantity === undefined) {
      return { ok: false, reason: `Estoque inválido («${stockRaw}»).` };
    }
  }
  if (lowStockRaw) {
    min_stock_quantity = parseOptionalInt(lowStockRaw);
    if (min_stock_quantity === undefined) {
      return { ok: false, reason: `Estoque baixo inválido («${lowStockRaw}»).` };
    }
  }

  return { ok: true, price, discount_price, stock_quantity, min_stock_quantity };
}

function effectiveUnitPrice(price?: number, discount?: number): number | undefined {
  if (discount != null && price != null && discount < price) return discount;
  if (discount != null && price == null) return discount;
  return price;
}

function buildBasePayload(
  get: (role: ColumnRole) => string,
  name: string,
  extras: {
    price?: number;
    discount_price?: number;
    stock_quantity?: number;
    min_stock_quantity?: number;
    variations?: ProductVariation[];
  },
): WooProductImportPayload {
  const { status, is_public } = parsePublished(get("published"));
  const shortRaw = get("short_description");
  const descRaw = get("description");
  const sku = get("sku").trim() || undefined;
  const category = parseWooCategory(get("categories"));
  const images = parseImageUrls(get("images"));

  const payload: WooProductImportPayload = {
    type: "product",
    name,
    currency: "BRL",
    features: [],
    images,
    secondary_images: [],
    variations: extras.variations ?? [],
    is_public,
    status,
    has_contract: false,
    is_recurring: false,
  };
  if (sku) payload.sku = sku;
  if (category) payload.category = category;
  if (extras.price !== undefined) payload.price = extras.price;
  if (extras.discount_price !== undefined) payload.discount_price = extras.discount_price;
  if (extras.stock_quantity !== undefined) payload.stock_quantity = extras.stock_quantity;
  if (extras.min_stock_quantity !== undefined) payload.min_stock_quantity = extras.min_stock_quantity;
  if (shortRaw) {
    const short_description = stripHtmlToText(shortRaw);
    if (short_description) payload.short_description = short_description;
  }
  if (descRaw) {
    const description = stripHtmlToText(descRaw);
    if (description) payload.description = description;
  }
  return payload;
}

/**
 * Converte CSV de exportação WooCommerce (PT ou EN) em payloads de produtos
 * **simple** e **variable** (variações agregadas no pai — PI13).
 */
export function prepareWooProductsFromCsv(csvText: string): {
  prepared: WooCsvImportPreparedRow[];
  skipped: WooCsvImportSkip[];
} {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: "Arquivo vazio ou sem linhas de dados." }],
    };
  }

  const headerCells = parseCsvLine(rows[0]).map((c) => c.trim());
  const roleByIndex: (ColumnRole | "ignore")[] = headerCells.map((h) => mapHeaderToRole(h));
  const attrCols = detectAttributeColumns(headerCells);

  const hasName = roleByIndex.includes("name");
  const hasType = roleByIndex.includes("type");
  if (!hasName || !hasType) {
    return {
      prepared: [],
      skipped: [
        {
          line: 1,
          reason:
            "Cabeçalho WooCommerce não reconhecido. Inclua as colunas «Nome»/«Name» e «Tipo»/«Type».",
        },
      ],
    };
  }

  const getFrom = (cells: string[], role: ColumnRole): string => {
    const idx = roleByIndex.indexOf(role);
    if (idx < 0) return "";
    return (cells[idx] ?? "").trim();
  };

  const getCell = (cells: string[], col: number): string => (cells[col] ?? "").trim();

  const parsed: ParsedLine[] = [];
  const skipped: WooCsvImportSkip[] = [];

  for (let r = 1; r < rows.length; r++) {
    const lineNumber = r + 1;
    const cells = parseCsvLine(rows[r]);
    const typeRaw = normalizeType(getFrom(cells, "type"));
    const name = getFrom(cells, "name").trim();
    const externalId = getFrom(cells, "id").trim() || undefined;
    const parentId = parseWooParentRef(getFrom(cells, "parent"));

    if (!typeRaw) {
      skipped.push({ line: lineNumber, reason: "Sem tipo de produto." });
      continue;
    }
    if (typeRaw === "grouped") {
      skipped.push({ line: lineNumber, reason: "Produto agrupado não suportado." });
      continue;
    }
    if (typeRaw === "external" || typeRaw === "affiliate") {
      skipped.push({ line: lineNumber, reason: "Produto externo/afiliado não suportado." });
      continue;
    }
    if (
      typeRaw !== "simple" &&
      typeRaw !== "variable" &&
      typeRaw !== "variation"
    ) {
      skipped.push({ line: lineNumber, reason: `Tipo «${typeRaw}» não suportado.` });
      continue;
    }

    parsed.push({ lineNumber, cells, type: typeRaw, name, externalId, parentId });
  }

  const variationsByParent = new Map<string, ParsedLine[]>();
  const orphans: ParsedLine[] = [];
  const parentIds = new Set(
    parsed.filter((p) => p.type === "variable" && p.externalId).map((p) => p.externalId!),
  );

  for (const row of parsed) {
    if (row.type !== "variation") continue;
    if (!row.parentId || !parentIds.has(row.parentId)) {
      orphans.push(row);
      continue;
    }
    const list = variationsByParent.get(row.parentId) ?? [];
    list.push(row);
    variationsByParent.set(row.parentId, list);
  }

  for (const orphan of orphans) {
    skipped.push({
      line: orphan.lineNumber,
      reason: orphan.parentId
        ? `Variação órfã — pai id:${orphan.parentId} não encontrado no arquivo.`
        : "Variação sem produto pai (Ascendente/Parent).",
    });
  }

  const prepared: WooCsvImportPreparedRow[] = [];
  const consumedVariationLines = new Set<number>();

  const pushPrepared = (row: WooCsvImportPreparedRow) => {
    if (prepared.length >= WOO_IMPORT_MAX_PREPARED) {
      skipped.push({
        line: row.lineNumber,
        reason: `Limite de ${WOO_IMPORT_MAX_PREPARED} produtos por importação atingido.`,
      });
      return false;
    }
    prepared.push(row);
    return true;
  };

  // --- simple ---
  for (const row of parsed) {
    if (row.type !== "simple") continue;
    if (!row.name) {
      skipped.push({ line: row.lineNumber, reason: "Sem nome." });
      continue;
    }
    const get = (role: ColumnRole) => getFrom(row.cells, role);
    const ps = parsePriceStockFields(get);
    if (!ps.ok) {
      skipped.push({ line: row.lineNumber, reason: ps.reason });
      continue;
    }
    const payload = buildBasePayload(get, row.name, {
      price: ps.price,
      discount_price: ps.discount_price,
      stock_quantity: ps.stock_quantity,
      min_stock_quantity: ps.min_stock_quantity,
      variations: [],
    });
    pushPrepared({
      lineNumber: row.lineNumber,
      sourceType: "simple",
      externalId: row.externalId,
      payload,
    });
  }

  // --- variable (+ variations absorvidas) ---
  for (const row of parsed) {
    if (row.type !== "variable") continue;
    if (!row.name) {
      skipped.push({ line: row.lineNumber, reason: "Sem nome." });
      continue;
    }

    const get = (role: ColumnRole) => getFrom(row.cells, role);
    const ps = parsePriceStockFields(get);
    if (!ps.ok) {
      skipped.push({ line: row.lineNumber, reason: ps.reason });
      continue;
    }

    const children =
      row.externalId != null ? variationsByParent.get(row.externalId) ?? [] : [];

    for (const child of children) {
      consumedVariationLines.add(child.lineNumber);
    }

    let variations = buildVariationsFromCells(row.cells, attrCols);
    variations = mergeVariationAttrsFromChildren(variations, children, attrCols, getCell);

    // PI13: preço do pai = menor preço efetivo das variations (se houver)
    const childPrices: number[] = [];
    let stockSum = 0;
    let stockSeen = false;
    for (const child of children) {
      const cGet = (role: ColumnRole) => getFrom(child.cells, role);
      const cps = parsePriceStockFields(cGet);
      if (!cps.ok) continue;
      const unit = effectiveUnitPrice(cps.price, cps.discount_price);
      if (unit != null) childPrices.push(unit);
      if (cps.stock_quantity != null) {
        stockSum += cps.stock_quantity;
        stockSeen = true;
      }
    }

    let price = ps.price;
    let discount_price = ps.discount_price;
    if (childPrices.length > 0) {
      price = Math.min(...childPrices);
      // Preço agregado já é o mínimo efetivo; não forçar discount no pai
      discount_price = undefined;
    }

    let stock_quantity = ps.stock_quantity;
    if (stock_quantity == null && stockSeen) {
      stock_quantity = stockSum;
    }

    const payload = buildBasePayload(get, row.name, {
      price,
      discount_price,
      stock_quantity,
      min_stock_quantity: ps.min_stock_quantity,
      variations,
    });

    // Se pai sem imagens, usa a 1ª imagem de uma variation
    if (payload.images.length === 0) {
      for (const child of children) {
        const imgs = parseImageUrls(getFrom(child.cells, "images"));
        if (imgs.length > 0) {
          payload.images = imgs.slice(0, MAX_IMAGES);
          break;
        }
      }
    }

    pushPrepared({
      lineNumber: row.lineNumber,
      sourceType: "variable",
      externalId: row.externalId,
      variationLineNumbers: children.map((c) => c.lineNumber),
      payload,
    });
  }

  return { prepared, skipped };
}
