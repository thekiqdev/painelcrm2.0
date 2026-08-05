/**
 * Helpers do nó condition multi-caso (S17) — espelho BE.
 */

export type ConditionOperator = 'eq' | 'neq' | 'contains' | 'exists' | 'empty';

export type ConditionRule = {
  variable: string;
  operator: ConditionOperator;
  value: string;
};

export type ConditionCase = {
  id: string;
  name: string;
  join: 'and' | 'or';
  conditions: ConditionRule[];
};

const OPERATORS = new Set<string>(['eq', 'neq', 'contains', 'exists', 'empty']);

export function conditionCaseHandle(caseId: string): string {
  return `case:${caseId}`;
}

export function parseConditionCaseHandle(handle: string): string | null {
  if (!handle.startsWith('case:')) return null;
  const id = handle.slice(5).trim();
  return id || null;
}

function sanitizeCaseId(raw: string, fallback: string): string {
  const id = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
  return id || fallback;
}

function normalizeRule(raw: unknown): ConditionRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const variable = String(o.variable ?? '').trim();
  if (!variable) return null;
  const opRaw = String(o.operator || 'eq');
  const operator = (OPERATORS.has(opRaw) ? opRaw : 'eq') as ConditionOperator;
  return {
    variable,
    operator,
    value: String(o.value ?? ''),
  };
}

/** true se o data ainda é o shape legado (1 regra flat). */
export function isLegacyConditionData(data: Record<string, unknown>): boolean {
  if (Array.isArray(data.cases) && data.cases.length > 0) return false;
  return Boolean(String(data.variable || '').trim());
}

/**
 * Converte data legado { variable, operator, value } → { cases: [...] }.
 * Se já tiver cases, só normaliza.
 */
export function migrateLegacyConditionData(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') {
    return {
      cases: [
        {
          id: 'c1',
          name: 'Caso 1',
          join: 'and',
          conditions: [{ variable: 'answer', operator: 'eq', value: '' }],
        },
      ],
    };
  }
  const data = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(data.cases) && data.cases.length > 0) {
    const cases = normalizeConditionCases(data.cases);
    return {
      label: data.label,
      cases:
        cases.length > 0
          ? cases
          : [
              {
                id: 'c1',
                name: 'Caso 1',
                join: 'and',
                conditions: [{ variable: 'answer', operator: 'eq', value: '' }],
              },
            ],
    };
  }
  if (isLegacyConditionData(data)) {
    const rule = normalizeRule(data) || {
      variable: 'answer',
      operator: 'eq' as const,
      value: '',
    };
    return {
      label: data.label,
      cases: [
        {
          id: 'c1',
          name: 'Caso 1',
          join: 'and',
          conditions: [rule],
        },
      ],
    };
  }
  return {
    label: data.label,
    cases: [
      {
        id: 'c1',
        name: 'Caso 1',
        join: 'and',
        conditions: [{ variable: 'answer', operator: 'eq', value: '' }],
      },
    ],
  };
}

export function normalizeConditionCases(raw: unknown): ConditionCase[] {
  if (!Array.isArray(raw)) return [];
  const out: ConditionCase[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = sanitizeCaseId(String(o.id || ''), `c${i + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const conditionsRaw = Array.isArray(o.conditions) ? o.conditions : [];
    const conditions = conditionsRaw.map(normalizeRule).filter(Boolean) as ConditionRule[];
    if (conditions.length === 0) continue;
    out.push({
      id,
      name: String(o.name ?? `Caso ${out.length + 1}`).slice(0, 48),
      join: String(o.join || 'and') === 'or' ? 'or' : 'and',
      conditions,
    });
  }
  return out;
}

/** Leitura no editor: permite cases incompletos enquanto digita. */
export function readConditionCasesForEditor(raw: unknown): ConditionCase[] {
  if (!Array.isArray(raw)) return [];
  const out: ConditionCase[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    // Permite id vazio enquanto digita (não forçar fallback — evita “travar” o input)
    const id = String(o.id ?? '').slice(0, 64);
    const conditionsRaw = Array.isArray(o.conditions) ? o.conditions : [];
    const conditions: ConditionRule[] =
      conditionsRaw.length === 0
        ? [{ variable: '', operator: 'eq', value: '' }]
        : conditionsRaw.map((r) => {
            const n = normalizeRule(r);
            if (n) return n;
            const obj = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
            return {
              variable: String(obj.variable ?? ''),
              operator: (OPERATORS.has(String(obj.operator))
                ? String(obj.operator)
                : 'eq') as ConditionOperator,
              value: String(obj.value ?? ''),
            };
          });
    out.push({
      id,
      name: String(o.name ?? `Caso ${i + 1}`).slice(0, 48),
      join: String(o.join || 'and') === 'or' ? 'or' : 'and',
      conditions,
    });
  }
  return out;
}

export function outHandlesForCondition(data: Record<string, unknown>): string[] {
  const migrated = migrateLegacyConditionData(data);
  const cases = normalizeConditionCases(migrated.cases);
  return [...cases.map((c) => conditionCaseHandle(c.id)), 'else'];
}

export function newConditionCaseId(existing: Array<{ id: string }>): string {
  let n = existing.length + 1;
  let id = `c${n}`;
  const ids = new Set(existing.map((c) => c.id));
  while (ids.has(id)) {
    n += 1;
    id = `c${n}`;
  }
  return id;
}

export function evalConditionRule(
  rule: ConditionRule,
  variables: Record<string, unknown>
): boolean {
  const actual = variables[rule.variable] == null ? '' : String(variables[rule.variable]);
  const expected = String(rule.value ?? '');
  const op = rule.operator || 'eq';
  if (op === 'exists') return actual.trim() !== '';
  if (op === 'empty') return actual.trim() === '';
  if (op === 'neq') return actual !== expected;
  if (op === 'contains') return actual.toLowerCase().includes(expected.toLowerCase());
  return actual === expected;
}

export function evalConditionCase(
  c: ConditionCase,
  variables: Record<string, unknown>
): boolean {
  if (c.conditions.length === 0) return false;
  if (c.join === 'or') {
    return c.conditions.some((r) => evalConditionRule(r, variables));
  }
  return c.conditions.every((r) => evalConditionRule(r, variables));
}

/** Primeiro case que casa, ou null → else. */
export function pickConditionCase(
  data: Record<string, unknown>,
  variables: Record<string, unknown>
): ConditionCase | null {
  const migrated = migrateLegacyConditionData(data);
  const cases = normalizeConditionCases(migrated.cases);
  for (const c of cases) {
    if (evalConditionCase(c, variables)) return c;
  }
  return null;
}

export function pickConditionHandle(
  data: Record<string, unknown>,
  variables: Record<string, unknown>
): string {
  const matched = pickConditionCase(data, variables);
  return matched ? conditionCaseHandle(matched.id) : 'else';
}

type GraphLike = {
  nodes?: unknown[];
  edges?: unknown[];
};

/**
 * Migra nós condition legados + edges true/false → case:{id}/else.
 * Idempotente.
 */
export function migrateConditionGraph<T extends GraphLike>(graph: T): T {
  const nodesIn = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edgesIn = Array.isArray(graph.edges) ? graph.edges : [];

  const firstCaseByNode = new Map<string, string>();
  const nodes = nodesIn.map((n) => {
    if (!n || typeof n !== 'object') return n;
    const item = n as Record<string, unknown>;
    if (item.type !== 'condition') return n;
    const data =
      item.data && typeof item.data === 'object'
        ? (item.data as Record<string, unknown>)
        : {};
    const migrated = migrateLegacyConditionData(data);
    const cases = normalizeConditionCases(migrated.cases);
    if (cases[0] && typeof item.id === 'string') {
      firstCaseByNode.set(item.id, cases[0].id);
    }
    return { ...item, data: migrated };
  });

  const edges = edgesIn.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const item = e as Record<string, unknown>;
    const source = typeof item.source === 'string' ? item.source : '';
    const handle = typeof item.sourceHandle === 'string' ? item.sourceHandle : '';
    const firstCaseId = firstCaseByNode.get(source);
    if (!firstCaseId) return e;
    if (handle === 'true') {
      return { ...item, sourceHandle: conditionCaseHandle(firstCaseId) };
    }
    if (handle === 'false') {
      return { ...item, sourceHandle: 'else' };
    }
    return e;
  });

  return { ...graph, nodes, edges };
}
