import type { Client } from "@/services/clients";

export type ContractCsvSkip = { line: number; reason: string };

export type PreparedContractCsvRow = {
  lineNumber: number;
  createPayload: {
    title: string;
    client_id?: string;
    total_value: number | null;
    start_date: string | null;
    end_date: string | null;
    currency: string;
    content_html: string;
    tags: string[];
  };
  /** Se true, após POST com sucesso chama PATCH status ACTIVE. */
  activateAfterCreate: boolean;
  /** Aviso não bloqueante (ex.: cliente não encontrado). */
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

function parsePtBrDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Valor em reais (ex.: R$3.000,00) → número decimal. */
export function parseBrlToDecimal(raw: string): number | null {
  let s = raw.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** «Assinado» / «Não assinado» etc. */
export function parseSignatureSigned(raw: string): boolean {
  const t = raw.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!t) return false;
  if (/nao\s*assin|pendente/.test(t)) return false;
  if (/assinado|^assin|^signed|^sim$|^s$/.test(t)) return true;
  return false;
}

export function resolveClientIdByName(clients: Client[], name: string): string | undefined {
  const q = name.trim().toLowerCase();
  if (!q) return undefined;
  const byName = clients.find((c) => (c.name ?? "").trim().toLowerCase() === q);
  if (byName) return byName.id;
  const byCompany = clients.find((c) => (c.company ?? "").trim().toLowerCase() === q);
  return byCompany?.id;
}

function mapHeaderToRole(cell: string): string | "ignore" {
  const key = normalizeHeaderKey(cell.replace(/^#+$/, "#"));
  const map: Record<string, string> = {
    "#": "ignore",
    assunto: "title",
    cliente: "client",
    "tipo de contrato": "contract_type",
    "valor do contrato": "amount",
    "data de início": "start_date",
    "data de inicio": "start_date",
    "data final": "end_date",
    projeto: "project",
    assinatura: "signature",
  };
  const direct = map[key];
  if (direct) return direct;
  if (key.includes("assinatura")) return "signature";
  if (key.includes("valor")) return "amount";
  if (key.includes("início") || key.includes("inicio")) return "start_date";
  return "ignore";
}

function buildImportHtml(parts: {
  title: string;
  clientLabel: string;
  contractType: string;
  project: string;
  signatureRaw: string;
}): string {
  const proj = parts.project.trim()
    ? `<p>Projeto: ${escapeHtml(parts.project.trim())}.</p>`
    : "";
  return `<p><strong>Importação CSV</strong></p><p>${escapeHtml(parts.title)}</p><p>Cliente: ${escapeHtml(parts.clientLabel)}. Tipo: ${escapeHtml(parts.contractType || "—")}.</p>${proj}<p>Assinatura (planilha): ${escapeHtml(parts.signatureRaw.trim() || "—")}.</p>`;
}

/**
 * CSV tipo export «Contratos»: #, Assunto, Cliente, Tipo, Valor (R$), datas DD/MM/AAAA, Projeto, Assinatura.
 */
export function prepareContractsFromCsv(csvText: string, clients: Client[]): {
  prepared: PreparedContractCsvRow[];
  skipped: ContractCsvSkip[];
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

  const hasTitle = roleByIndex.some((r) => r === "title");
  if (!hasTitle) {
    return {
      prepared: [],
      skipped: [
        {
          line: 1,
          reason: 'Cabeçalho sem coluna «Assunto» (ou «título»).',
        },
      ],
    };
  }

  const prepared: PreparedContractCsvRow[] = [];
  const skipped: ContractCsvSkip[] = [];

  for (let r = 1; r < rows.length; r++) {
    const lineNumber = r + 1;
    const cells = parseCsvLine(rows[r]);
    const get = (role: string): string => {
      const idx = roleByIndex.findIndex((x) => x === role);
      if (idx < 0) return "";
      return (cells[idx] ?? "").trim();
    };

    const title = get("title");
    if (!title) {
      skipped.push({ line: lineNumber, reason: "Assunto vazio." });
      continue;
    }

    const clientName = get("client");
    const contractType = get("contract_type");
    const amountRaw = get("amount");
    const startRaw = get("start_date");
    const endRaw = get("end_date");
    const project = get("project");
    const signatureRaw = get("signature");

    const start_date = parsePtBrDate(startRaw);
    const end_date = parsePtBrDate(endRaw);

    if (startRaw && !start_date) {
      skipped.push({ line: lineNumber, reason: `Data de início inválida: «${startRaw}»` });
      continue;
    }
    if (endRaw && !end_date) {
      skipped.push({ line: lineNumber, reason: `Data final inválida: «${endRaw}»` });
      continue;
    }

    let total_value: number | null = null;
    if (amountRaw) {
      const dec = parseBrlToDecimal(amountRaw);
      if (dec == null) {
        skipped.push({ line: lineNumber, reason: `Valor inválido: «${amountRaw}»` });
        continue;
      }
      total_value = dec;
    }

    let client_id: string | undefined;
    let warn: string | undefined;
    if (clientName) {
      client_id = resolveClientIdByName(clients, clientName);
      if (!client_id) {
        warn = `Cliente não encontrado: «${clientName}» — contrato sem vínculo.`;
      }
    }

    const tags = ["Importação CSV"];
    if (contractType) tags.push(contractType);

    const content_html = buildImportHtml({
      title,
      clientLabel: clientName || "—",
      contractType,
      project,
      signatureRaw,
    });

    const activateAfterCreate = parseSignatureSigned(signatureRaw);

    prepared.push({
      lineNumber,
      createPayload: {
        title,
        client_id,
        total_value,
        start_date,
        end_date,
        currency: "BRL",
        content_html,
        tags,
      },
      activateAfterCreate,
      warn,
    });
  }

  return { prepared, skipped };
}
