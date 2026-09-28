import type { Client } from "@/services/clients";
import type { Member } from "@/services/members";

export type ProjectCsvSkip = { line: number; reason: string };

export type PreparedProjectImportRow = {
  lineNumber: number;
  payload: {
    name: string;
    status: string;
    project_type: "simple";
    due_date: string | null;
    start_date: string | null;
    end_date: string | null;
    tags: string[];
    client_id: string | null;
    responsible_ids: string[];
    description: string | null;
  };
  warnings: string[];
};

function normalizeKey(s: string): string {
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

/** dd/MM/yyyy ou dd/MM/yyyy HH:mm → ISO date yyyy-MM-dd */
export function parsePtDateToIso(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Valores usados em Configurações do projeto (Select). */
export function mapProjectStatusFromCsv(raw: string): string {
  const k = normalizeKey(raw);
  if (!k) return "active";
  const map: Record<string, string> = {
    ativo: "active",
    active: "active",
    "em progresso": "active",
    "em andamento": "active",
    andamento: "active",
    progresso: "active",
    "em espera": "on-hold",
    pausado: "on-hold",
    "on-hold": "on-hold",
    espera: "on-hold",
    concluido: "completed",
    concluído: "completed",
    completed: "completed",
    finalizado: "completed",
    cancelado: "cancelled",
    cancelled: "cancelled",
  };
  return map[k] ?? "active";
}

function splitMemberNames(s: string): string[] {
  return s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveMemberIds(
  members: Member[],
  raw: string,
  lineNumber: number,
): { ids: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const names = splitMemberNames(raw);
  if (names.length === 0) return { ids: [], warnings };
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const q = normalizeKey(name);
    const m = members.find((mem) => normalizeKey(mem.name) === q);
    if (m) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        ids.push(m.id);
      }
    } else {
      warnings.push(
        `Linha ${lineNumber}: Membro «${name}» não encontrado — use o mesmo nome que em Equipe/Membros.`,
      );
    }
  }
  return { ids, warnings };
}

function resolveClientId(
  clients: Client[],
  raw: string,
  lineNumber: number,
): { client_id: string | null; warning?: string; note?: string } {
  const q = raw.trim();
  if (!q) return { client_id: null };
  const nq = normalizeKey(q);
  const exact = clients.filter((c) => {
    const n = normalizeKey(c.name || "");
    const comp = normalizeKey(c.company || "");
    return n === nq || comp === nq;
  });
  if (exact.length === 1) return { client_id: exact[0].id };
  if (exact.length > 1) {
    return {
      client_id: exact[0].id,
      warning: `Linha ${lineNumber}: vários clientes com o mesmo nome «${q}» — foi usado o primeiro.`,
    };
  }
  return {
    client_id: null,
    note: `Cliente (planilha, não encontrado): ${q}`,
  };
}

function parseTags(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}

type ColumnRole =
  | "name"
  | "client"
  | "tags"
  | "start"
  | "due"
  | "members"
  | "status"
  | "ignore";

function mapHeaderToRole(cell: string): ColumnRole {
  const key = normalizeKey(cell.replace(/^#+$/, "#"));
  const map: Record<string, ColumnRole> = {
    "#": "ignore",
    "nome do projeto": "name",
    cliente: "client",
    client: "client",
    tags: "tags",
    "data de inicio": "start",
    "data de início": "start",
    inicio: "start",
    "data inicio": "start",
    prazo: "due",
    deadline: "due",
    "membros do projeto": "members",
    membros: "members",
    status: "status",
  };
  if (map[key]) return map[key];
  if (key.includes("nome") && key.includes("projeto")) return "name";
  if (key.includes("membro")) return "members";
  if (key.includes("inicio") || key.includes("início")) return "start";
  return "ignore";
}

/**
 * CSV tipo export «Projetos»: #, Nome do Projeto, Cliente, Tags, Data de Início, Prazo, Membros, Status.
 */
export function prepareProjectsFromCsv(
  csvText: string,
  members: Member[],
  clients: Client[],
): { prepared: PreparedProjectImportRow[]; skipped: ProjectCsvSkip[] } {
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
      skipped: [{ line: 1, reason: 'Cabeçalho sem coluna «Nome do Projeto» (ou «Nome»).' }],
    };
  }

  const prepared: PreparedProjectImportRow[] = [];
  const skipped: ProjectCsvSkip[] = [];

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
      skipped.push({ line: lineNumber, reason: "Nome do projeto vazio." });
      continue;
    }

    const status = mapProjectStatusFromCsv(get("status"));
    const startIso = parsePtDateToIso(get("start"));
    const dueIso = parsePtDateToIso(get("due"));

    const tags = parseTags(get("tags"));
    const { ids: responsible_ids, warnings: memWarnings } = resolveMemberIds(members, get("members"), lineNumber);

    const clientRaw = get("client");
    const { client_id, warning: clientWarn, note: clientNote } = resolveClientId(clients, clientRaw, lineNumber);

    const descParts: string[] = [];
    if (clientNote) descParts.push(clientNote);
    const description = descParts.length > 0 ? descParts.join("\n").slice(0, 8000) : null;

    const warnings: string[] = [...memWarnings];
    if (clientWarn) warnings.push(clientWarn);

    prepared.push({
      lineNumber,
      payload: {
        name,
        status,
        project_type: "simple",
        due_date: dueIso,
        start_date: startIso,
        end_date: dueIso,
        tags,
        client_id,
        responsible_ids,
        description,
      },
      warnings,
    });
  }

  return { prepared, skipped };
}
