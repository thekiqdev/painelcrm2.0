import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildVariantOptionsFromAttrs,
  mapWooAxisToPv,
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

describe("mapWooAxisToPv / buildVariantOptionsFromAttrs", () => {
  it("mapeia Color/Size", () => {
    expect(mapWooAxisToPv("Color")).toBe("Cor");
    expect(mapWooAxisToPv("size")).toBe("Tamanho");
    expect(mapWooAxisToPv("Peso")).toBeNull();
  });

  it("monta Cor×Tamanho", () => {
    expect(
      buildVariantOptionsFromAttrs([
        { name: "Color", values: ["Red"] },
        { name: "Size", values: ["M"] },
      ]),
    ).toEqual({
      option1_name: "Cor",
      option1_value: "Red",
      option2_name: "Tamanho",
      option2_value: "M",
    });
  });
});

describe("stripHtmlToText", () => {
  it("remove tags e normaliza quebras", () => {
    expect(stripHtmlToText("<p>Olá</p><br/>Mundo")).toContain("Olá");
    expect(stripHtmlToText("a\\nb")).toBe("a\nb");
  });
});

describe("prepareWooProductsFromCsv", () => {
  it("fixture: 2 simple + 1 variable com variants[] reais (PV10)", () => {
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
    expect(simple[0].payload.has_variants).toBe(false);
    expect(simple[0].payload.external_id).toBe("2020");
    expect(simple[0].payload.images[0]).toMatch(/^https:\/\/example\.com\//);

    const parent = variable[0];
    expect(parent.payload.name).toMatch(/SIGNATURE CAP/);
    expect(parent.payload.has_variants).toBe(true);
    expect(parent.payload.external_id).toBe("1970");
    expect(parent.payload.price).toBe(69.9);
    expect(parent.payload.variants).toHaveLength(2);
    expect(parent.payload.variants?.[0]).toMatchObject({
      option1_name: "Cor",
      option1_value: "Azul claro",
      price: 69.9,
      external_id: "1976",
    });
    expect(parent.payload.variants?.[0].images?.[0]).toMatch(/demo-1976/);
    expect(parent.payload.variants?.[1]).toMatchObject({
      option1_value: "Branco",
      external_id: "1977",
    });
    expect(parent.payload.variations?.[0].name).toBe("Cor");
    expect(parent.payload.variations?.[0].values).toEqual(
      expect.arrayContaining(["Azul claro", "Branco", "Marron", "Preto", "Rosa"]),
    );
    expect(parent.variationLineNumbers).toEqual([3, 4]);
    expect(skipped.some((s) => /órfã|Variação/i.test(s.reason))).toBe(false);
  });

  it("aceita cabeçalhos EN: simple + variable com variants reais", () => {
    const csv = [
      "ID,Type,SKU,Name,Published,Short description,Description,Regular price,Sale price,Stock,Categories,Images,Parent,Attribute 1 name,Attribute 1 value(s)",
      '10,simple,SKU-1,Demo Cap,1,"Short","<p>Long</p>",69.90,49.90,5,Hats,"https://example.com/a.jpg, https://example.com/b.jpg",,,',
      '11,variable,,Parent Cap,1,,,,,,Hats,"https://example.com/p.jpg",,Color,"Red, Blue"',
      '12,variation,SKU-R,Parent Cap - Red,1,,,59.90,,2,,"https://example.com/r.jpg",id:11,Color,Red',
      '13,variation,SKU-B,Parent Cap - Blue,1,,,79.90,,3,,"https://example.com/b.jpg",id:11,Color,Blue',
    ].join("\n");

    const { prepared, skipped } = prepareWooProductsFromCsv(csv);
    expect(skipped).toEqual([]);
    expect(prepared).toHaveLength(2);

    const simple = prepared.find((p) => p.sourceType === "simple")!;
    expect(simple.payload.name).toBe("Demo Cap");
    expect(simple.payload.price).toBe(69.9);
    expect(simple.payload.discount_price).toBe(49.9);
    expect(simple.payload.description).toBe("Long");
    expect(simple.payload.has_variants).toBe(false);

    const variable = prepared.find((p) => p.sourceType === "variable")!;
    expect(variable.payload.name).toBe("Parent Cap");
    expect(variable.payload.has_variants).toBe(true);
    expect(variable.payload.price).toBe(59.9);
    expect(variable.payload.stock_quantity).toBe(5);
    expect(variable.payload.variations).toEqual([{ name: "Cor", values: ["Red", "Blue"] }]);
    expect(variable.payload.variants).toHaveLength(2);
    expect(variable.payload.variants?.[0]).toMatchObject({
      option1_name: "Cor",
      option1_value: "Red",
      sku: "SKU-R",
      price: 59.9,
      stock_quantity: 2,
      external_id: "12",
    });
    expect(variable.variationLineNumbers).toHaveLength(2);
  });

  it("variable Cor×Tamanho gera opções em 2 eixos", () => {
    const csv = [
      "ID,Type,Name,Published,Regular price,Parent,Attribute 1 name,Attribute 1 value(s),Attribute 2 name,Attribute 2 value(s)",
      "1,variable,Shirt,1,,,Color,\"Red, Blue\",Size,\"S, M\"",
      "2,variation,Shirt Red S,1,10,id:1,Color,Red,Size,S",
      "3,variation,Shirt Blue M,1,12,id:1,Color,Blue,Size,M",
    ].join("\n");
    const { prepared } = prepareWooProductsFromCsv(csv);
    const v = prepared[0]!;
    expect(v.payload.has_variants).toBe(true);
    expect(v.payload.variants).toHaveLength(2);
    expect(v.payload.variants?.[0]).toMatchObject({
      option1_name: "Cor",
      option1_value: "Red",
      option2_name: "Tamanho",
      option2_value: "S",
    });
    expect(v.payload.variations).toEqual([
      { name: "Cor", values: expect.arrayContaining(["Red", "Blue"]) },
      { name: "Tamanho", values: expect.arrayContaining(["S", "M"]) },
    ]);
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
