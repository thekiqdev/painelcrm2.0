export type PreparedPaymentImportRow = {
  lineNumber: number;
  amount_cents: number;
  transaction_date: string;
  description: string;
  reference_name: string | null;
};

export type PaymentCsvSkip = {
  line: number;
  reason: string;
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

type ColumnRole =
  | "payment_no"
  | "invoice"
  | "mode"
  | "tx_id"
  | "client"
  | "amount"
  | "date"
  | "ignore";

const HEADER_SYNONYMS: Record<string, ColumnRole> = {
  "#": "ignore",
  "pagamento #": "payment_no",
  pagamento: "payment_no",
  "fatura #": "invoice",
  fatura: "invoice",
  invoice: "invoice",
  "modo de pagamento": "mode",
  modo: "mode",
  "id da transacao": "tx_id",
  "id da transação": "tx_id",
  transacao: "tx_id",
  transação: "tx_id",
  cliente: "client",
  customer: "client",
  quantia: "amount",
  valor: "amount",
  amount: "amount",
  data: "date",
  date: "date",
};

function mapHeaderToRole(cell: string): ColumnRole | "ignore" {
  const key = normalizeHeaderKey(cell.replace(/^#+$/, "#"));
  const direct = HEADER_SYNONYMS[key];
  if (direct) return direct;
  if (key.includes("fatura")) return "invoice";
  if (key.includes("pagamento") && key.includes("#")) return "payment_no";
  if (key.includes("modo")) return "mode";
  if (key.includes("transacao") || key.includes("transação")) return "tx_id";
  if (key.includes("quantia") || key === "valor") return "amount";
  return "ignore";
}

function parsePtBrDate(s: string): string | null {
  const t = s.trim();
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

/** Aceita «R$19,90», «1.234,56», «19.90», etc. */
export function parseBrlToCents(raw: string): number | null {
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
  return Math.round(n * 100);
}

function buildDescription(parts: {
  lineNumber: number;
  paymentNo: string;
  invoice: string;
  mode: string;
  txId: string;
}): string {
  const seg: string[] = [];
  if (parts.paymentNo) seg.push(`Pagamento #${parts.paymentNo}`);
  if (parts.invoice) seg.push(`Fatura ${parts.invoice}`);
  if (parts.mode) seg.push(parts.mode);
  if (parts.txId) seg.push(`Ref. ${parts.txId}`);
  if (seg.length > 0) return seg.join(" · ");
  return `Pagamento importado (linha ${parts.lineNumber})`;
}

/**
 * CSV tipo export «Pagamentos»: colunas como Pagamento #, Fatura #, Modo de Pagamento,
 * ID da Transação, Cliente, Quantia (R$), Data (DD/MM/AAAA).
 * Gera linhas de entrada (recebimentos) para a conta corrente seleccionada.
 */
export function preparePaymentsFromCsv(csvText: string): {
  prepared: PreparedPaymentImportRow[];
  skipped: PaymentCsvSkip[];
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

  const hasAmount = roleByIndex.some((r) => r === "amount");
  const hasDate = roleByIndex.some((r) => r === "date");
  if (!hasAmount || !hasDate) {
    return {
      prepared: [],
      skipped: [
        {
          line: 1,
          reason:
            "Cabeçalho incompleto. São necessárias colunas de Quantia e Data (ex.: export Pagamentos).",
        },
      ],
    };
  }

  const prepared: PreparedPaymentImportRow[] = [];
  const skipped: PaymentCsvSkip[] = [];

  for (let r = 1; r < rows.length; r++) {
    const lineNumber = r + 1;
    const cells = parseCsvLine(rows[r]);
    const get = (role: ColumnRole): string => {
      const idx = roleByIndex.findIndex((x) => x === role);
      if (idx < 0) return "";
      return (cells[idx] ?? "").trim();
    };

    const amountRaw = get("amount");
    const dateRaw = get("date");
    const cents = parseBrlToCents(amountRaw);
    const isoDate = parsePtBrDate(dateRaw);

    if (cents == null || cents <= 0) {
      skipped.push({ line: lineNumber, reason: `Quantia inválida: «${amountRaw}»` });
      continue;
    }
    if (!isoDate) {
      skipped.push({ line: lineNumber, reason: `Data inválida: «${dateRaw}» (use DD/MM/AAAA)` });
      continue;
    }

    const paymentNo = get("payment_no");
    const invoice = get("invoice");
    const mode = get("mode");
    const txId = get("tx_id");
    const client = get("client");

    const description = buildDescription({
      lineNumber,
      paymentNo,
      invoice,
      mode,
      txId,
    });
    const reference_name = client.length > 0 ? client : null;

    prepared.push({
      lineNumber,
      amount_cents: cents,
      transaction_date: isoDate,
      description,
      reference_name,
    });
  }

  return { prepared, skipped };
}
