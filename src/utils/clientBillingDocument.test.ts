import { describe, expect, it } from "vitest";
import {
  clientDocumentWrite,
  clientDocumentsFromRecord,
  visibleBillingStar,
} from "@/utils/clientBillingDocument";

describe("documento de cobrança no cadastro", () => {
  it("cliente antigo com CPF não mostra estrela até existir CNPJ", () => {
    const docs = clientDocumentsFromRecord({ cpf_cnpj: "52998224725", billing_document: "cpf" });
    expect(docs.savedBilling).toBe("cpf");
    expect(visibleBillingStar(docs.cpf, "", docs.savedBilling, null)).toBeNull();
    expect(visibleBillingStar(docs.cpf, "64.033.061/0001-38", docs.savedBilling, null)).toBe("cpf");
  });

  it("salvar o segundo documento sem clique não envia troca de estrela", () => {
    const payload = clientDocumentWrite({
      cpf: "529.982.247-25",
      cnpj: "64.033.061/0001-38",
      rg: "MG-12",
      razaoSocial: "Padaria Silva",
      billingChoice: null,
    });
    expect(payload.billing_document).toBeUndefined();
    expect(payload.cpf).toBe("52998224725");
    expect(payload.cnpj).toBe("64033061000138");
  });

  it("clique na estrela envia o documento escolhido", () => {
    const payload = clientDocumentWrite({
      cpf: "529.982.247-25",
      cnpj: "64.033.061/0001-38",
      rg: "",
      razaoSocial: "",
      billingChoice: "cnpj",
    });
    expect(payload.billing_document).toBe("cnpj");
  });
});
