/** Parser CSV alinhado a `src/utils/importLeadsCsv.ts` e `importClientsCsv.ts` (tenant). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LeadCsvSkip = { line: number; reason: string };

export type PreparedSuperadminLeadRow = {
  lineNumber: number;
  payload: {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    source: string;
    status: string | null;
    notes: string | null;
    assignee_label: string | null;
    group_name: string | null;
  };
  warn?: string;
};

export type PreparedSuperadminClientRow = {
  lineNumber: number;
  payload: {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    active_label: string;
    group_name: string | null;
  };
};

export type ClientCsvSkip = { line: number; reason: string };

function normalizeHeaderKey(s: string): string {
  return s
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
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
    } else if (c === ',') {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      cur += c;
    } else if (!inQuotes && (c === '\n' || (c === '\r' && text[i + 1] === '\n'))) {
      if (c === '\r') i++;
      rows.push(cur);
      cur = '';
    } else if (!inQuotes && c === '\r') {
      rows.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows.filter((r) => r.trim().length > 0);
}

function parseBrlToDecimal(raw: string): number | null {
  let s = raw.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = s.replace(/,/g, '');
  }
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

type LeadColumnRole =
  | 'name'
  | 'company'
  | 'email'
  | 'phone'
  | 'value'
  | 'tags'
  | 'assignee'
  | 'status'
  | 'source'
  | 'last_contact'
  | 'created'
  | 'group'
  | 'ignore';

function mapLeadHeaderToRole(cell: string): LeadColumnRole | 'ignore' {
  const key = normalizeHeaderKey(cell.replace(/^#+$/, '#'));
  const map: Record<string, LeadColumnRole> = {
    '#': 'ignore',
    nome: 'name',
    empresa: 'company',
    'e-mail': 'email',
    email: 'email',
    telefone: 'phone',
    'valor do lead': 'value',
    tags: 'tags',
    atribuido: 'assignee',
    status: 'status',
    fonte: 'source',
    'ultimo contato': 'last_contact',
    'último contato': 'last_contact',
    criado: 'created',
    grupos: 'group',
    grupo: 'group',
    group: 'group',
  };
  if (map[key]) return map[key];
  if (key.includes('valor')) return 'value';
  if (key.includes('ultimo') || key.includes('último')) return 'last_contact';
  if (key.includes('atrib')) return 'assignee';
  if (key.includes('grupo')) return 'group';
  return 'ignore';
}

function buildLeadNotes(parts: {
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
        ? `Valor (importação): ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dec)}`
        : `Valor (importação): ${parts.valueRaw.trim()}`
    );
  }
  if (parts.tags.trim()) lines.push(`Tags: ${parts.tags.trim()}`);
  if (parts.assigneeUnmatched.trim()) lines.push(`Atribuído (planilha): ${parts.assigneeUnmatched.trim()}`);
  if (parts.lastContact.trim()) lines.push(`Último contato (origem): ${parts.lastContact.trim()}`);
  if (parts.created.trim()) lines.push(`Criado (origem): ${parts.created.trim()}`);
  const s = lines.join('\n');
  return s.length > 0 ? s.slice(0, 8000) : null;
}

export function prepareSuperadminLeadsFromCsv(csvText: string): {
  prepared: PreparedSuperadminLeadRow[];
  skipped: LeadCsvSkip[];
} {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: 'Arquivo vazio ou sem linhas de dados.' }],
    };
  }

  const headerCells = parseCsvLine(rows[0]).map((c) => c.trim());
  const roleByIndex = headerCells.map((h) => mapLeadHeaderToRole(h));

  if (!roleByIndex.some((r) => r === 'name')) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: 'Cabeçalho sem coluna «Nome».' }],
    };
  }

  const prepared: PreparedSuperadminLeadRow[] = [];
  const skipped: LeadCsvSkip[] = [];

  for (let r = 1; r < rows.length; r++) {
    const lineNumber = r + 1;
    const cells = parseCsvLine(rows[r]);
    const get = (role: LeadColumnRole): string => {
      const idx = roleByIndex.findIndex((x) => x === role);
      if (idx < 0) return '';
      return (cells[idx] ?? '').trim();
    };

    const name = get('name');
    if (!name) {
      skipped.push({ line: lineNumber, reason: 'Nome vazio.' });
      continue;
    }

    let email = get('email');
    if (email && !EMAIL_RE.test(email)) {
      email = '';
    }

    const phoneRaw = get('phone') || null;
    const phone =
      normalizePhoneDigits(phoneRaw) || (phoneRaw ? phoneRaw.replace(/\s+/g, ' ').trim() || null : null);
    const company = get('company') || null;
    const valueRaw = get('value');
    const tags = get('tags');
    const assignee = get('assignee');
    const statusRaw = get('status');
    const sourceRaw = get('source');
    const lastContact = get('last_contact');
    const created = get('created');
    const group_name = get('group').trim() || null;

    let warn: string | undefined;
    if (assignee) {
      warn = `Atribuído «${assignee}» — perfis de tenant não aplicam no Super Admin; gravado como texto.`;
    }

    const notes = buildLeadNotes({
      valueRaw,
      tags,
      lastContact,
      created,
      assigneeUnmatched: assignee,
    });

    const source =
      sourceRaw.trim() ||
      (tags.trim() ? tags.trim().slice(0, 120) : '') ||
      'Importação CSV';

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
        assignee_label: assignee.trim() || null,
        group_name,
      },
      warn,
    });
  }

  return { prepared, skipped };
}

function normalizePhoneDigits(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 10) return digits;
  return undefined;
}

type ClientColumnRole = 'name' | 'company' | 'email' | 'phone' | 'active' | 'group' | 'ignore';

const CLIENT_HEADER_SYNONYMS: Record<string, ClientColumnRole | 'ignore'> = {
  '#': 'ignore',
  empresa: 'company',
  company: 'company',
  'contato principal': 'name',
  nome: 'name',
  name: 'name',
  'e-mail principal': 'email',
  email: 'email',
  'e-mail': 'email',
  telefone: 'phone',
  celular: 'phone',
  phone: 'phone',
  whatsapp: 'phone',
  ativo: 'active',
  status: 'active',
  grupos: 'group',
  grupo: 'group',
  group: 'group',
  'data criada': 'ignore',
  'data de criacao': 'ignore',
  criado_em: 'ignore',
};

function mapClientHeaderToRole(cell: string): ClientColumnRole | 'ignore' {
  const key = normalizeHeaderKey(cell.replace(/^#+$/, '#'));
  const direct = CLIENT_HEADER_SYNONYMS[key as keyof typeof CLIENT_HEADER_SYNONYMS];
  if (direct) return direct;
  if (key.includes('email') || key.includes('e-mail')) return 'email';
  if (key.includes('telefone') || key === 'celular') return 'phone';
  if (key.includes('empresa')) return 'company';
  if (key.includes('contato') || key === 'nome') return 'name';
  return 'ignore';
}

function parseActive(raw: string): string {
  const v = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s/g, '');
  if (!v) return 'Ativo';
  if (['sim', 's', 'yes', 'y', '1', 'ativo', 'true'].includes(v)) return 'Ativo';
  if (['nao', 'n', 'no', '0', 'inativo', 'false'].includes(v)) return 'Inativo';
  return 'Ativo';
}

export function prepareSuperadminClientsFromCsv(csvText: string): {
  prepared: PreparedSuperadminClientRow[];
  skipped: ClientCsvSkip[];
} {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    return {
      prepared: [],
      skipped: [{ line: 1, reason: 'Arquivo vazio ou sem linhas de dados.' }],
    };
  }

  const headerCells = parseCsvLine(rows[0]).map((c) => c.trim());
  const roleByIndex: (ClientColumnRole | 'ignore')[] = headerCells.map((h) => mapClientHeaderToRole(h));

  const hasName = roleByIndex.some((r) => r === 'name');
  const hasCompany = roleByIndex.some((r) => r === 'company');
  if (!hasName && !hasCompany) {
    return {
      prepared: [],
      skipped: [
        {
          line: 1,
          reason:
            'Cabeçalho não reconhecido. Inclua colunas como «Contato principal» ou «Nome» e/ou «Empresa».',
        },
      ],
    };
  }

  const prepared: PreparedSuperadminClientRow[] = [];
  const skipped: ClientCsvSkip[] = [];

  for (let r = 1; r < rows.length; r++) {
    const lineNumber = r + 1;
    const cells = parseCsvLine(rows[r]);
    const get = (role: ClientColumnRole): string => {
      const idx = roleByIndex.findIndex((x) => x === role);
      if (idx < 0) return '';
      return (cells[idx] ?? '').trim();
    };

    let name = get('name');
    const company = get('company');
    if (!name && company) name = company;
    if (!name) {
      skipped.push({ line: lineNumber, reason: 'Sem nome ou empresa.' });
      continue;
    }

    let email = get('email');
    if (email && !EMAIL_RE.test(email)) {
      email = '';
    }

    const phoneRaw = get('phone');
    const phone =
      normalizePhoneDigits(phoneRaw) || (phoneRaw.replace(/\s+/g, ' ').trim() || null);
    const active_label = parseActive(get('active'));
    const groupCell = get('group');
    const group_name = groupCell.trim() || null;

    prepared.push({
      lineNumber,
      payload: {
        name,
        email: email || null,
        phone,
        company: company || null,
        active_label,
        group_name,
      },
    });
  }

  return { prepared, skipped };
}

export function normalizeLeadPhoneForSend(raw: string | null | undefined): string | null {
  const d = normalizePhoneDigits(raw);
  return d ?? null;
}
