import { parseBrlToDecimal } from "@/utils/importContractsCsv";

export type LeadCsvProfile = { id: string; name: string };

export type LeadCsvSkip = { line: number; reason: string };

export type PreparedLeadImportRow = {
  lineNumber: number;
  payload: {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: string;
    status: string | null;
    notes: string | null;
    profile_id: string | null;
  };
  warn?: string;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ColumnRole =
  | "name"
  | "company"
  | "email"
  | "phone"
  | "value"
  | "tags"
  | "assignee"
  | "status"
  | "source"
  | "last_contact"
  | "created"
  | "ignore";

function mapHeaderToRole(cell: string): ColumnRole | "ignore" {
  const key = normalizeHeaderKey(cell.replace(/^#+$/, "#"));
  const map: Record<string, ColumnRole> = {
    "#": "ignore",
    nome: "name",
    empresa: "company",
    "e-mail": "email",
    email: "email",
    telefone: "phone",
    "valor do lead": "value",
    tags: "tags",
    atribuido: "assignee",
    status: "status",
    fonte: "source",
    "ultimo contato": "last_contact",
    "último contato": "last_contact",
    criado: "created",
  };
  if (map[key]) return map[key];
  if (key.includes("valor")) return "value";
  if (key.includes("ultimo") || key.includes("último")) return "last_contact";
  if (key.includes("atrib")) return "assignee";
  return "ignore";
}

export function resolveProfileIdByName(profiles: LeadCsvProfile[], assignee: string): string | undefined {
  const q = assignee.trim().toLowerCase();
  if (!q) return undefined;
  return profiles.find((p) => (p.name ?? "").trim().toLowerCase() === q)?.id;
}

function buildNotes(parts: {
  valueRaw: string;
  tags: string;
  lastContact: string;
  created: string;
  assigneeUnmatched: string;
}): string | null {
  const lines: string[] = [];
  if (parts.valueRaw.trim()) {
    const dec = parseBrlToDecimal(parts.valueRaw);
    lines.push(
      dec != null
        ? `Valor (importação): ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(dec)}`
        : `Valor (importação): ${parts.valueRaw.trim()}`,
    );
  }
  if (parts.tags.trim()) lines.push(`Tags: ${parts.tags.trim()}`);
  if (parts.assigneeUnmatched.trim()) lines.push(`Atribuído (planilha): ${parts.assigneeUnmatched.trim()}`);
  if (parts.lastContact.trim()) lines.push(`Último contato (origem): ${parts.lastContact.trim()}`);
  if (parts.created.trim()) lines.push(`Criado (origem): ${parts.created.trim()}`);
  const s = lines.join("\n");
  return s.length > 0 ? s.slice(0, 8000) : null;
}

/**
 * CSV tipo export «Leads»: #, Nome, Empresa, E-mail, Telefone, Valor, Tags, Atribuído, Status, Fonte, datas.
 */
export function prepareLeadsFromCsv(csvText: string, profiles: LeadCsvProfile[]): {
  prepared: PreparedLeadImportRow[];
  skipped: LeadCsvSkip[];
} {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: "Arquivo vazio ou sem linhas de dados." }],
    };
  }

  const headerCells = parseCsvLine(rows[0]).map((c) => c.trim());
  const roleByIndex = headerCells.map((h) => mapHeaderToRole(h));

  if (!roleByIndex.some((r) => r === "name")) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: 'Cabeçalho sem coluna «Nome».' }],
    };
  }

  const prepared: PreparedLeadImportRow[] = [];
  const skipped: LeadCsvSkip[] = [];

  for (let r = 1; r < rows.length; r++) {
    const lineNumber = r + 1;
    const cells = parseCsvLine(rows[r]);
    const get = (role: ColumnRole): string => {
      const idx = roleByIndex.findIndex((x) => x === role);
      if (idx < 0) return "";
      return (cells[idx] ?? "").trim();
    };

    const name = get("name");
    if (!name) {
      skipped.push({ line: lineNumber, reason: "Nome vazio." });
      continue;
    }

    let email = get("email");
    if (email && !EMAIL_RE.test(email)) {
      email = "";
    }

    const phone = get("phone") || null;
    const company = get("company") || null;
    const valueRaw = get("value");
    const tags = get("tags");
    const assignee = get("assignee");
    const statusRaw = get("status");
    const sourceRaw = get("source");
    const lastContact = get("last_contact");
    const created = get("created");

    let profile_id: string | null = null;
    let warn: string | undefined;
    if (assignee) {
      const pid = resolveProfileIdByName(profiles, assignee);
      if (pid) profile_id = pid;
      else warn = `Perfil não encontrado para «${assignee}» — use o mesmo nome do perfil em Configurações.`;
    }

    const notes = buildNotes({
      valueRaw,
      tags,
      lastContact,
      created,
      assigneeUnmatched: profile_id ? "" : assignee,
    });

    const source =
      sourceRaw.trim() ||
      (tags.trim() ? tags.trim().slice(0, 120) : "") ||
      "Importação CSV";

    const status = statusRaw.trim() || null;

    prepared.push({
      lineNumber,
      payload: {
        name,
        email: email || null,
        phone,
        company,
        source: source.slice(0, 500),
        status,
        notes,
        profile_id,
      },
      warn,
    });
  }

  return { prepared, skipped };
}
