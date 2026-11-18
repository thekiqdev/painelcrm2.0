import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildClientImportPlan,
  clientImportFileFromMatrices,
  parseClientImportCsvText,
  suggestColumns,
  type ClientImportFile,
} from "@/utils/importClientsCsv";

function planFrom(files: ClientImportFile[]) {
  return buildClientImportPlan(files, files.flatMap((file) => suggestColumns(file)), []);
}

describe("importação de clientes", () => {
  it("detecta CSV com ponto e vírgula e mescla telefone com celular", () => {
    const file = parseClientImportCsvText(
      "1",
      "clientes.csv",
      "Nome;Telefone;Celular;E-mail;Ativo\nAna;(11)1111-1111;(11)99999-9999;ana@exemplo.com;Sim\n",
    );
    const fields = suggestColumns(file).map((column) => [column.header, column.field]);
    expect(fields).toEqual([
      ["Nome", "name"],
      ["Telefone", "phone"],
      ["Celular", "phone"],
      ["E-mail", "email"],
      ["Ativo", "status"],
    ]);
    const { prepared, skipped } = planFrom([file]);
    expect(skipped).toEqual([]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].payload).toMatchObject({
      name: "Ana",
      phone: "11999999999",
      email: "ana@exemplo.com",
      status: "Ativo",
    });
  });

  it("une clientes, endereços e contatos pelo código", () => {
    const clients = parseClientImportCsvText(
      "c",
      "clientes.csv",
      [
        "Codigo,Nome,CPF,CNPJ,Razão social,Ativo,Telefone,Celular,E-mail",
        "1,Stephanie,,,,Sim,,(11)98608-0975,",
        "4,CARITAS CAMPO LIMPO,,64.033.061/0001-38,,Sim,(11)5841-3365,,",
        "106,Cliente 106,,,,Sim,(11)3333-4444,,",
      ].join("\n"),
    );
    const addresses = parseClientImportCsvText(
      "e",
      "enderecos.csv",
      "Código,Tipo,CEP,Logradouro,Número,Complemento,Bairro,Cidade,UF\n1,,05749-330,Rua Miguel Masi Neto,200,casa,Jardim das Palmas,São Paulo,SP\n",
    );
    const contacts = parseClientImportCsvText(
      "t",
      "contatos.csv",
      "Código,Tipo de contato,Nome,Contato,Cargo,Observação\n106,Telefone,Jonnathan,(11) 97455-2516,,\n",
    );

    const contactFields = Object.fromEntries(suggestColumns(contacts).map((column) => [column.header, column.field]));
    expect(contactFields.Nome).toBe("contact_name");
    expect(contactFields["Código"]).toBe("external_code");
    expect(contactFields.Contato).toBe("contact_value");

    const { prepared, skipped } = planFrom([clients, addresses, contacts]);
    expect(skipped).toEqual([]);
    expect(prepared).toHaveLength(3);

    const stephanie = prepared.find((row) => row.payload.name === "Stephanie");
    expect(stephanie?.payload.phone).toBe("11986080975");
    expect(stephanie?.payload.company).toBeUndefined();
    expect(stephanie?.address).toMatchObject({
      street: "Rua Miguel Masi Neto",
      number: "200",
      city: "São Paulo",
      state: "SP",
      postal_code: "05749-330",
      is_default: true,
    });

    const company = prepared.find((row) => row.payload.name === "CARITAS CAMPO LIMPO");
    expect(company?.payload.cnpj).toBe("64033061000138");
    expect(company?.payload.billing_document).toBe("cnpj");
    expect(company?.payload.cpf).toBeUndefined();
    expect(company?.payload.phone).toBe("1158413365");

    const withContact = prepared.find((row) => row.payload.name === "Cliente 106");
    expect(withContact?.payload.phone).toBe("1133334444");
    expect(withContact?.payload.observacao).toContain("Jonnathan");
    expect(withContact?.payload.observacao).toContain("97455-2516");
  });

  it("não cria cliente só com endereço", () => {
    const addresses = parseClientImportCsvText(
      "e",
      "enderecos.csv",
      "Código,CEP,Logradouro,Cidade,UF\n9,05749-330,Rua A,São Paulo,SP\n",
    );
    const { prepared, skipped } = planFrom([addresses]);
    expect(prepared).toEqual([]);
    expect(skipped[0]?.reason).toContain("sem nome ou empresa");
  });

  it("separa CPF, CNPJ, RG, razão social e nome fantasia", () => {
    const file = parseClientImportCsvText(
      "c",
      "clientes.csv",
      "Nome,CPF,CNPJ,RG,Razão social,Nome fantasia\nAna,529.982.247-25,64.033.061/0001-38,1234567,Padaria Silva LTDA,Padaria\n",
    );
    const fields = Object.fromEntries(suggestColumns(file).map((column) => [column.header, column.field]));
    expect(fields).toMatchObject({
      CPF: "cpf",
      CNPJ: "cnpj",
      RG: "rg",
      "Razão social": "razao_social",
      "Nome fantasia": "company",
    });
    const { prepared } = planFrom([file]);
    expect(prepared[0].payload).toMatchObject({
      name: "Ana",
      cpf: "52998224725",
      cnpj: "64033061000138",
      rg: "1234567",
      razao_social: "Padaria Silva LTDA",
      company: "Padaria",
      billing_document: "cpf",
    });
  });

  it("coluna única CPF/CNPJ cai no campo pelo tamanho", () => {
    const file = parseClientImportCsvText(
      "c",
      "clientes.csv",
      "Nome,CPF/CNPJ\nLoja,64.033.061/0001-38\n",
    );
    expect(suggestColumns(file).find((column) => column.header === "CPF/CNPJ")?.field).toBe("cpf_cnpj");
    const { prepared } = planFrom([file]);
    expect(prepared[0].payload.cnpj).toBe("64033061000138");
    expect(prepared[0].payload.billing_document).toBe("cnpj");
    expect(prepared[0].payload.cpf).toBeUndefined();
  });

  it("documento inválido não derruba a linha", () => {
    const file = parseClientImportCsvText(
      "c",
      "clientes.csv",
      "Nome,CPF\nAna,111.111.111-11\n",
    );
    const { prepared } = planFrom([file]);
    expect(prepared[0].payload.cpf).toBeUndefined();
    expect(prepared[0].payload.billing_document).toBeUndefined();
    expect(prepared[0].warnings.join(" ")).toMatch(/CPF inválido/);
  });
});

const sampleFiles = [
  "c:/Users/kssan/Downloads/clientes.xlsx",
  "c:/Users/kssan/Downloads/clientes_enderecos.xlsx",
  "c:/Users/kssan/Downloads/clientes_contatos.xlsx",
];

describe("planilhas de exemplo", () => {
  it.skipIf(sampleFiles.some((file) => !existsSync(file)))("mescla os três arquivos reais", async () => {
    const XLSX = await import("xlsx");
    const files = sampleFiles.map((filePath, index) => {
      const workbook = XLSX.read(readFileSync(filePath), { type: "buffer" });
      const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
      return clientImportFileFromMatrices(
        String(index),
        fileName,
        workbook.SheetNames.map((name) => ({
          name,
          matrix: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
            header: 1,
            defval: "",
            raw: false,
          }) as unknown[][],
        })),
      );
    });

    const { prepared, skipped } = planFrom(files);
    expect(prepared).toHaveLength(117);
    expect(prepared.filter((row) => row.address?.street)).toHaveLength(117);
    expect(skipped.filter((skip) => skip.reason.includes("sem nome"))).toEqual([]);

    const stephanie = prepared.find((row) => row.payload.name.includes("Stephanie"));
    expect(stephanie?.payload.phone).toBe("11986080975");
    expect(stephanie?.address?.street).toContain("Miguel");
    expect(stephanie?.address?.state).toBe("SP");

    const caritas = prepared.find((row) => row.payload.name.includes("CARITAS"));
    expect(caritas?.payload.cnpj).toBe("64033061000138");
    expect(caritas?.payload.billing_document).toBe("cnpj");
    expect(caritas?.payload.cpf).toBeUndefined();

    const extraContact = prepared.find((row) => row.payload.observacao?.includes("Jonnathan"));
    expect(extraContact?.payload.name).not.toBe("Jonnathan");
    expect(extraContact?.payload.observacao).toContain("97455-2516");
  });
});
