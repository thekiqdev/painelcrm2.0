/**
 * CSV simples para campanhas (nome, telefone, email opcional, variavel_1..3).
 * Delimitador: vírgula ou ponto e vírgula (detectado na primeira linha).
 */

export type CsvCampaignRow = {
  name: string;
  phone_raw: string;
  email?: string;
  var1?: string;
  var2?: string;
  var3?: string;
};

function detectDelimiter(headerLine: string): ',' | ';' {
  const sc = (headerLine.match(/;/g) || []).length;
  const cc = (headerLine.match(/,/g) || []).length;
  return sc > cc ? ';' : ',';
}

function splitRow(line: string, delim: ',' | ';'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && ch === delim) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const HEADER_MAP: Record<string, keyof CsvCampaignRow | 'skip'> = {
  nome: 'name',
  name: 'name',
  telefone: 'phone_raw',
  phone: 'phone_raw',
  celular: 'phone_raw',
  email: 'email',
  variavel_1: 'var1',
  variavel_2: 'var2',
  variavel_3: 'var3',
  variável_1: 'var1',
  variável_2: 'var2',
  variável_3: 'var3',
};

export function parseCampaignCsv(text: string): {
  rows: CsvCampaignRow[];
  errors: string[];
} {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const errors: string[] = [];
  if (lines.length < 2) {
    errors.push('CSV vazio ou só cabeçalho');
    return { rows: [], errors };
  }
  const delim = detectDelimiter(lines[0]!);
  const headers = splitRow(lines[0]!, delim).map((h) =>
    h.toLowerCase().replace(/\s+/g, '_').replace(/ã/g, 'a')
  );
  const colIndex: Partial<Record<keyof CsvCampaignRow, number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key && key !== 'skip') {
      colIndex[key] = i;
    }
  });
  if (colIndex.phone_raw === undefined) {
    errors.push('Coluna de telefone obrigatória (telefone)');
    return { rows: [], errors };
  }

  const rows: CsvCampaignRow[] = [];
  const seenPhones = new Set<string>();

  for (let li = 1; li < lines.length; li++) {
    const parts = splitRow(lines[li]!, delim);
    const phoneRaw = (parts[colIndex.phone_raw!] ?? '').trim();
    if (!phoneRaw) {
      errors.push(`Linha ${li + 1}: telefone vazio`);
      continue;
    }
    const d = normalizePhoneE164Digits(phoneRaw);
    if (!d) {
      errors.push(`Linha ${li + 1}: telefone inválido`);
      continue;
    }
    if (seenPhones.has(d)) continue;
    seenPhones.add(d);

    rows.push({
      name: colIndex.name !== undefined ? (parts[colIndex.name] ?? '').trim() : '',
      phone_raw: phoneRaw,
      email:
        colIndex.email !== undefined ? (parts[colIndex.email] ?? '').trim() || undefined : undefined,
      var1: colIndex.var1 !== undefined ? (parts[colIndex.var1] ?? '').trim() || undefined : undefined,
      var2: colIndex.var2 !== undefined ? (parts[colIndex.var2] ?? '').trim() || undefined : undefined,
      var3: colIndex.var3 !== undefined ? (parts[colIndex.var3] ?? '').trim() || undefined : undefined,
    });
  }

  return { rows, errors };
}

/** Dígitos E.164 sem + (ex.: 5511999999999). Default BR (+55) se 10–11 dígitos locais. */
export function normalizePhoneE164Digits(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length < 10) return null;
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) {
    if (d.startsWith('0')) d = d.replace(/^0+/, '');
    return `55${d}`;
  }
  if (d.length >= 12) return d;
  return null;
}
