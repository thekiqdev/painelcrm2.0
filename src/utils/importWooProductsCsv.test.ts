import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseWooCategory,
  parseWooDecimal,
  parseWooParentRef,
  prepareWooProductsFromCsv,
  stripHtmlToText,
} from "@/utils/importWooProductsCsv";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const sampleCsv = readFileSync(path.join(fixtureDir, "__fixtures__/woo-products-sample.csv"), "utf8");

describe("parseWooDecimal", () => {
  it("parseia formato BR", () => {
    expect(parseWooDecimal("199,99")).toBe(199.99);
    expect(parseWooDecimal("1.234,56")).toBe(1234.56);
    expect(parseWooDecimal("69,90")).toBe(69.9);
  });

  it("parseia formato EN e vazio", () => {
    expect(parseWooDecimal("69.90")).toBe(69.9);
    expect(parseWooDecimal("")).toBeUndefined();
    expect(parseWooDecimal("abc")).toBeUndefined();
  });
});

describe("parseWooCategory", () => {
  it("usa primeiro segmento e folha de hierarquia", () => {
    expect(parseWooCategory("Bolsas")).toBe("Bolsas");
    expect(parseWooCategory("Acessórios > Bonés, Promo")).toBe("Bonés");
  });
});

describe("parseWooParentRef", () => {
  it("aceita id:N e N", () => {
    expect(parseWooParentRef("id:1970")).toBe("1970");
    expect(parseWooParentRef("1970")).toBe("1970");
    expect(parseWooParentRef("")).toBeUndefined();
  });
});

describe("stripHtmlToText", () => {
  it("remove tags e normaliza quebras", () => {
    expect(stripHtmlToText("<p>Olá</p><br/>Mundo")).toContain("Olá");
    expect(stripHtmlToText("a\\nb")).toBe("a\nb");
  });
});

describe("prepareWooProductsFromCsv", () => {
  it("fixture: 2 simple + 1 variable com atributos e preço min das variations", () => {
    const { prepared, skipped } = prepareWooProductsFromCsv(sampleCsv);
    expect(prepared).toHaveLength(3);

    const simple = prepared.filter((p) => p.sourceType === "simple");
    const variable = prepared.filter((p) => p.sourceType === "variable");
    expect(simple).toHaveLength(2);
    expect(variable).toHaveLength(1);

    expect(simple.map((p) => p.payload.name)).toEqual([
      "BAG FIT FORCE MULTIFUNCIONAL",
      "BOLSA TOTE",
    ]);
    expect(simple[0].payload.price).toBe(199.99);
    expect(simple[0].payload.category).toBe("Bolsas");
    expect(simple[0].payload.images[0]).toMatch(/^https:\/\/example\.com\//);

    const parent = variable[0];
    expect(parent.payload.name).toMatch(/SIGNATURE CAP/);
    expect(parent.payload.price).toBe(69.9);
    expect(parent.payload.variations?.length).toBe(1);
    expect(parent.payload.variations?.[0].name).toBe("Cor");
    expect(parent.payload.variations?.[0].values).toEqual(
      expect.arrayContaining(["Azul claro", "Branco", "Marron", "Preto", "Rosa"]),
    );
    expect(parent.variationLineNumbers).toEqual([3, 4]); // fixture lines: header=1, var=2, v1=3, v2=4
    expect(skipped.some((s) => /órfã|Variação/i.test(s.reason))).toBe(false);
  });

  it("aceita cabeçalhos EN: simple + variable com variation", () => {
    const csv = [
      "ID,Type,SKU,Name,Published,Short description,Description,Regular price,Sale price,Stock,Categories,Images,Parent,Attribute 1 name,Attribute 1 value(s)",
      '10,simple,SKU-1,Demo Cap,1,"Short","<p>Long</p>",69.90,49.90,5,Hats,"https://example.com/a.jpg, https://example.com/b.jpg",,,',
      '11,variable,,Parent Cap,1,,,,,,Hats,"https://example.com/p.jpg",,Color,"Red, Blue"',
      "12,variation,,Parent Cap - Red,1,,,,59.90,,,,id:11,Color,Red",
      "13,variation,,Parent Cap - Blue,1,,,,79.90,,,,id:11,Color,Blue",
    ].join("\n");

    const { prepared, skipped } = prepareWooProductsFromCsv(csv);
    expect(prepared).toHaveLength(2);
    expect(skipped).toHaveLength(0);

    const simple = prepared.find((p) => p.sourceType === "simple")!;
    expect(simple.payload.name).toBe("Demo Cap");
    expect(simple.payload.price).toBe(69.9);
    expect(simple.payload.discount_price).toBe(49.9);
    expect(simple.payload.description).toBe("Long");

    const variable = prepared.find((p) => p.sourceType === "variable")!;
    expect(variable.payload.name).toBe("Parent Cap");
    expect(variable.payload.price).toBe(59.9); // min das variations
    expect(variable.payload.variations).toEqual([{ name: "Color", values: ["Red", "Blue"] }]);
    expect(variable.variationLineNumbers).toHaveLength(2);
  });

  it("pula variation órfã", () => {
    const csv = [
      "ID,Tipo,Nome,Publicado,Preço,Ascendente",
      "1,variation,Filho órfão,1,\"10,00\",id:999",
    ].join("\n");
    const { prepared, skipped } = prepareWooProductsFromCsv(csv);
    expect(prepared).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/órfã/i);
  });

  it("marca Publicado=0 como draft não público", () => {
    const csv = 'Tipo,Nome,Publicado,Preço\nsimple,Rascunho Item,0,"10,00"\n';
    const { prepared } = prepareWooProductsFromCsv(csv);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].payload.status).toBe("draft");
    expect(prepared[0].payload.is_public).toBe(false);
    expect(prepared[0].payload.price).toBe(10);
  });

  it("rejeita cabeçalho sem Nome/Tipo", () => {
    const { prepared, skipped } = prepareWooProductsFromCsv("A,B\n1,2\n");
    expect(prepared).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/Cabeçalho/i);
  });

  it("pula preço inválido", () => {
    const csv = "Tipo,Nome,Publicado,Preço\nsimple,X,1,abc\n";
    const { prepared, skipped } = prepareWooProductsFromCsv(csv);
    expect(prepared).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/Preço inválido/i);
  });
});
