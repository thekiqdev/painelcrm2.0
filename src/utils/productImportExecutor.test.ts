import { describe, expect, it } from "vitest";
import {
  decodeWooCsvBuffer,
  hasWooCsvHeaders,
  normalizeProductSkuKey,
} from "@/utils/importWooProductsCsv";
import { buildExternalIdIndex, buildSkuIndex } from "@/utils/productImportExecutor";
import type { Product } from "@/types/products";

describe("decodeWooCsvBuffer / hasWooCsvHeaders", () => {
  it("reconhece cabeçalho UTF-8", () => {
    const csv = "Tipo,Nome,Publicado\nsimple,A,1\n";
    expect(hasWooCsvHeaders(csv)).toBe(true);
    const buf = new TextEncoder().encode(csv).buffer;
    expect(decodeWooCsvBuffer(buf)).toContain("Tipo,Nome");
  });

  it("fallback Latin-1 quando UTF-8 quebra acentuação do cabeçalho", () => {
    // Simula bytes Latin-1 de "Preço" no cabeçalho com Nome e Tipo
    const latin1Header = "Tipo,Nome,Pre\xe7o\nsimple,A,10\n";
    const bytes = Uint8Array.from(latin1Header, (c) => c.charCodeAt(0));
    // UTF-8 decode of Latin-1 ç byte may still have Tipo+Nome — ensure hasWoo works
    expect(hasWooCsvHeaders(new TextDecoder("iso-8859-1").decode(bytes))).toBe(true);
    const decoded = decodeWooCsvBuffer(bytes.buffer);
    expect(hasWooCsvHeaders(decoded)).toBe(true);
  });
});

describe("normalizeProductSkuKey / buildSkuIndex / buildExternalIdIndex", () => {
  it("normaliza SKU case-insensitive", () => {
    expect(normalizeProductSkuKey(" Abc-1 ")).toBe("abc-1");
    expect(normalizeProductSkuKey("")).toBe("");
  });

  it("indexa primeiro produto por SKU", () => {
    const products = [
      { id: "1", sku: "SKU-A", name: "A" },
      { id: "2", sku: "sku-a", name: "dup" },
      { id: "3", name: "sem sku" },
    ] as Product[];
    const map = buildSkuIndex(products);
    expect(map.get("sku-a")?.id).toBe("1");
    expect(map.size).toBe(1);
  });

  it("indexa por external_id", () => {
    const products = [
      { id: "1", external_id: "1970", name: "A" },
      { id: "2", name: "sem" },
    ] as Product[];
    const map = buildExternalIdIndex(products);
    expect(map.get("1970")?.id).toBe("1");
    expect(map.size).toBe(1);
  });
});
