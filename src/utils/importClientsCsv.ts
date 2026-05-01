import type { ClientGroup } from "@/services/clients";
import type { ClientData } from "@/utils/clients-helpers";

export type CsvImportPreparedRow = {
  lineNumber: number;
  payload: ClientData;
};

export type CsvImportSkip = {
  line: number;
  reason: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const HEADER_SYNONYMS: Record<string, keyof ColumnRole | "ignore"> = {
  "#": "ignore",
  empresa: "company",
  company: "company",
  "contato principal": "name",
  nome: "name",
  name: "name",
  "e-mail principal": "email",
  email: "email",
  "e-mail": "email",
  telefone: "phone",
  celular: "phone",
  phone: "phone",
  whatsapp: "phone",
  ativo: "active",
  status: "active",
  grupos: "group",
  grupo: "group",
  group: "group",
  "data criada": "ignore",
  "data de criacao": "ignore",
  criado_em: "ignore",
};

type ColumnRole = "name" | "company" | "email" | "phone" | "active" | "group";

function mapHeaderToRole(cell: string): ColumnRole | "ignore" {
  const key = normalizeHeaderKey(cell.replace(/^#+$/, "#"));
  const direct = HEADER_SYNONYMS[key as keyof typeof HEADER_SYNONYMS];
  if (direct) return direct;
  if (key.includes("email") || key.includes("e-mail")) return "email";
  if (key.includes("telefone") || key === "celular") return "phone";
  if (key.includes("empresa")) return "company";
  if (key.includes("contato") || key === "nome") return "name";
  return "ignore";
}

function parseActive(raw: string): string {
  const v = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s/g, "");
  if (!v) return "Ativo";
  if (["sim", "s", "yes", "y", "1", "ativo", "true"].includes(v)) return "Ativo";
  if (["nao", "n", "no", "0", "inativo", "false"].includes(v)) return "Inativo";
  return "Ativo";
}

function normalizePhone(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 10) return digits;
  return t.replace(/\s+/g, " ").trim() || undefined;
}

function resolveGroupId(groupCell: string, groups: ClientGroup[]): string | undefined {
  const name = groupCell.trim();
  if (!name) return undefined;
  const lower = name.toLowerCase();
  const found = groups.find((g) => g.name.trim().toLowerCase() === lower);
  return found?.id;
}

/**
 * Converte texto CSV (exportações tipo PainelCRM / planilha) em linhas prontas para `addClient`.
 */
export function prepareClientsFromCsv(csvText: string, groups: ClientGroup[]): {
  prepared: CsvImportPreparedRow[];
  skipped: CsvImportSkip[];
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

  const hasName = roleByIndex.some((r) => r === "name");
  const hasCompany = roleByIndex.some((r) => r === "company");
  if (!hasName && !hasCompany) {
    return {
      prepared: [],
      skipped: [
        {
          line: 1,
          reason:
            "Cabeçalho não reconhecido. Inclua colunas como «Contato principal» ou «Nome» e/ou «Empresa».",
        },
      ],
    };
  }

  const prepared: CsvImportPreparedRow[] = [];
  const skipped: CsvImportSkip[] = [];

  for (let r = 1; r < rows.length; r++) {
    const lineNumber = r + 1;
    const cells = parseCsvLine(rows[r]);
    const get = (role: ColumnRole): string => {
      const idx = roleByIndex.findIndex((x) => x === role);
      if (idx < 0) return "";
      return (cells[idx] ?? "").trim();
    };

    let name = get("name");
    const company = get("company");
    if (!name && company) name = company;
    if (!name) {
      skipped.push({ line: lineNumber, reason: "Sem nome ou empresa." });
      continue;
    }

    let email = get("email");
    if (email && !EMAIL_RE.test(email)) {
      email = "";
    }

    const phone = normalizePhone(get("phone"));
    const status = parseActive(get("active"));
    const groupCell = get("group");
    const group_id = resolveGroupId(groupCell, groups);

    const payload: ClientData = {
      name,
      status,
    };
    if (company) payload.company = company;
    if (email) payload.email = email;
    if (phone) payload.phone = phone;
    if (group_id) payload.group_id = group_id;

    prepared.push({ lineNumber, payload });
  }

  return { prepared, skipped };
}
