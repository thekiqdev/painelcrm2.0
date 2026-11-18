import { describe, expect, it } from "vitest";
import { cnpjLookupFill } from "./cnpjLookup";

const found = { razao_social: "Razão Oficial", nome_fantasia: "Fantasia" };

describe("cnpjLookupFill", () => {
  it("preenche razão social e nome fantasia vazios", () => {
    expect(cnpjLookupFill({ razaoSocial: "", company: "  ", found })).toEqual({
      razao_social: "Razão Oficial",
      company: "Fantasia",
    });
  });

  it("não substitui razão social nem nome fantasia já digitados", () => {
    expect(cnpjLookupFill({
      razaoSocial: "Já informada",
      company: "Minha marca",
      found,
    })).toEqual({});
  });

  it("preenche só o campo que está vazio", () => {
    expect(cnpjLookupFill({
      razaoSocial: "Já informada",
      company: "",
      found,
    })).toEqual({ company: "Fantasia" });
  });
});
