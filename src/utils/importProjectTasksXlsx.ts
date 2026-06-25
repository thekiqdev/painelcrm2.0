import type { Member } from "@/services/members";
import { parsePtDateToIso } from "@/utils/importProjectsCsv";

/** @deprecated use ProjectTaskImportSkip */
export type ProjectTaskXlsxSkip = { line: number; reason: string };
export type ProjectTaskImportSkip = { line: number; reason: string };

export type PreparedProjectTaskImportRow = {
  lineNumber: number;
  payload: {
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    start_date: string | null;
    assignee_id: string | null;
    tags: string[];
  };
  warnings: string[];
};

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

function normalizeKey(s: string): string {
  return String(s ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function normalizeMemberNameForMatch(s: string): string {
  return normalizeKey(s);
}

export function resolveMemberIdByName(members: Member[], name: string): string | undefined {
  const q = normalizeMemberNameForMatch(name);
  if (!q) return undefined;
  return members.find((m) => normalizeMemberNameForMatch(m.name) === q)?.id;
}

function parseTags(raw: string): string[] {
  if (!String(raw).trim()) return [];
  return String(raw)
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** dd/MM/yyyy, ISO string, Excel serial ou Date */
function cellToIsoDate(cell: unknown): string | null {
  if (cell == null || cell === "") return null;
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, "0");
    const d = String(cell.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof cell === "number" && cell > 20000 && cell < 60000) {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(cell) * 86400000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(cell).trim();
  return parsePtDateToIso(s);
}

function mapTaskStatusFromSheet(raw: string): string {
  const k = normalizeKey(raw);
  if (!k) return "todo";
  const map: Record<string, string> = {
    completo: "completed",
    concluido: "completed",
    concluído: "completed",
    feito: "completed",
    done: "completed",
    finalizado: "completed",
    "nao iniciado": "todo",
    "não iniciado": "todo",
    pendente: "todo",
    "a fazer": "todo",
    afazer: "todo",
    backlog: "todo",
    todo: "todo",
    "em andamento": "in-progress",
    andamento: "in-progress",
    progresso: "in-progress",
    doing: "in-progress",
    revisao: "review",
    revisão: "review",
    review: "review",
  };
  return map[k] ?? "todo";
}

function mapPriorityFromSheet(raw: string): string {
  const k = normalizeKey(raw);
  if (!k) return "medium";
  const map: Record<string, string> = {
    baixa: "low",
    low: "low",
    media: "medium",
    média: "medium",
    medium: "medium",
    normal: "medium",
    alta: "high",
    high: "high",
    urgente: "high",
    critical: "high",
  };
  return map[k] ?? "medium";
}

type HeaderRole =
  | "ignore"
  | "title"
  | "status"
  | "start"
  | "due"
  | "assignee"
  | "tags"
  | "priority";

function mapHeaderCell(h: string): HeaderRole {
  const key = normalizeKey(String(h));
  if (key === "#" || key === "num" || key === "nr" || key === "no") return "ignore";
  if (key === "nome" || key.includes("titulo")) return "title";
  if (key === "status" || key === "estado") return "status";
  if (key.includes("inicio") || key.includes("início") || key === "start") return "start";
  if (
    key.includes("vencimento") ||
    key.includes("prazo") ||
    key === "due" ||
    key === "deadline"
  )
    return "due";
  if (key.includes("atribuido") || key.includes("atribuído") || key.includes("assignee"))
    return "assignee";
  if (key === "tags" || key === "tag") return "tags";
  if (key.includes("prioridade") || key === "priority") return "priority";
  return "ignore";
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const roles = row.map((c) => mapHeaderCell(String(c ?? "")));
    const hasTitle = roles.includes("title");
    const hasStatus = roles.includes("status");
    if (hasTitle && hasStatus) return i;
  }
  return -1;
}

function prepareTasksFromProjectTasksMatrix(
  rows: unknown[][],
  members: Member[],
): { prepared: PreparedProjectTaskImportRow[]; skipped: ProjectTaskImportSkip[] } {
  if (!rows.length) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: "Conteúdo vazio." }],
    };
  }

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) {
    return {
      prepared: [],
      skipped: [
        {
          line: 1,
          reason:
            "Não foi encontrada uma linha de cabeçalho com colunas «Nome» e «Status».",
        },
      ],
    };
  }

  const headerRow = rows[headerIdx] ?? [];
  const roles = headerRow.map((c) => mapHeaderCell(String(c ?? "")));

  if (!roles.includes("title")) {
    return {
      prepared: [],
      skipped: [{ line: headerIdx + 1, reason: 'Cabeçalho sem coluna «Nome» / título.' }],
    };
  }

  const prepared: PreparedProjectTaskImportRow[] = [];
  const skipped: ProjectTaskImportSkip[] = [];

  const getCell = (row: unknown[], role: HeaderRole): unknown => {
    const idx = roles.findIndex((r) => r === role);
    if (idx < 0) return "";
    return row[idx];
  };

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const lineNumber = r + 1;
    const row = rows[r] ?? [];
    const titleRaw = String(getCell(row, "title") ?? "").trim();
    if (!titleRaw) {
      skipped.push({ line: lineNumber, reason: "Título vazio." });
      continue;
    }

    const statusRaw = String(getCell(row, "status") ?? "").trim();
    const status = mapTaskStatusFromSheet(statusRaw);

    const priorityRaw = String(getCell(row, "priority") ?? "").trim();
    const priority = mapPriorityFromSheet(priorityRaw);

    const start_date = cellToIsoDate(getCell(row, "start"));
    const due_date = cellToIsoDate(getCell(row, "due"));

    const assigneeRaw = String(getCell(row, "assignee") ?? "").trim();
    let assignee_id: string | null = null;
    const warnings: string[] = [];
    if (assigneeRaw) {
      const mid = resolveMemberIdByName(members, assigneeRaw);
      if (mid) assignee_id = mid;
      else {
        warnings.push(
          `Linha ${lineNumber}: Membro «${assigneeRaw}» não encontrado — use o mesmo nome que em Equipe.`,
        );
      }
    }

    const tags = parseTags(String(getCell(row, "tags") ?? ""));

    prepared.push({
      lineNumber,
      payload: {
        title: titleRaw.slice(0, 500),
        status,
        priority,
        due_date,
        start_date,
        assignee_id,
        tags,
      },
      warnings,
    });
  }

  return { prepared, skipped };
}

/**
 * CSV export de tarefas (mesmo layout que Excel: #, Nome, Status, datas, Atribuído ao, Tags, Prioridade).
 */
export function prepareTasksFromProjectTasksCsv(
  csvText: string,
  members: Member[],
): { prepared: PreparedProjectTaskImportRow[]; skipped: ProjectTaskImportSkip[] } {
  const lines = splitCsvRows(csvText);
  if (lines.length === 0) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: "Arquivo vazio." }],
    };
  }
  const rows: unknown[][] = lines.map((line) => parseCsvLine(line));
  return prepareTasksFromProjectTasksMatrix(rows, members);
}

/**
 * Planilha exportada de tarefas (ex.: primeira folha com linha de título opcional,
 * cabeçalhos #, Nome, Status, Data de Início, Data de Vencimento, Atribuído ao, Tags, Prioridade).
 */
export async function prepareTasksFromProjectTasksXlsx(
  arrayBuffer: ArrayBuffer,
  members: Member[],
): Promise<{ prepared: PreparedProjectTaskImportRow[]; skipped: ProjectTaskImportSkip[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: "Workbook sem folhas." }],
    };
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  if (!rows.length) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: "Planilha vazia." }],
    };
  }

  return prepareTasksFromProjectTasksMatrix(rows, members);
}
