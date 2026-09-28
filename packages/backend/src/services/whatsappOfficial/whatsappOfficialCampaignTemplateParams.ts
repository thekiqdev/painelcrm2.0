/**
 * Constrói `components` da Graph API a partir de template (BODY) e mapeamento por slot.
 * template_variables: { "slots": { "1": { "source": "raw_payload", "key": "name" }, "2": { "source": "manual", "value": "X" } } }
 */

export type SlotMapping =
  | { source: 'raw_payload'; key: string }
  | { source: 'manual'; value: string }
  | { source: 'field'; field: 'name' | 'company' | 'phone' | 'email' | 'plan' | 'status' | 'var1' | 'var2' | 'var3' };

export type TemplateVariablesConfig = {
  slots?: Record<string, SlotMapping>;
};

const PLACEHOLDER_RE = /\{\{(\d+)\}\}/g;

export function extractBodyPlaceholderIndices(componentsJson: unknown): number[] {
  const nums = new Set<number>();
  const walk = (s: string) => {
    let m: RegExpExecArray | null;
    const re = /\{\{(\d+)\}\}/g;
    while ((m = re.exec(s)) !== null) {
      nums.add(parseInt(m[1]!, 10));
    }
  };
  const arr = Array.isArray(componentsJson) ? componentsJson : [];
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    if (String(o.type || '').toUpperCase() === 'BODY' && typeof o.text === 'string') {
      walk(o.text);
    }
  }
  return [...nums].sort((a, b) => a - b);
}

function getPayloadField(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (v == null) return '';
  return String(v).trim().slice(0, 1024);
}

function resolveSlotValue(
  slot: string,
  mapping: TemplateVariablesConfig | null | undefined,
  rawPayload: Record<string, unknown>
): string {
  const cfg = mapping?.slots?.[slot];
  if (!cfg) {
    return getPayloadField(rawPayload, 'name') || getPayloadField(rawPayload, 'phone');
  }
  if (cfg.source === 'manual') return (cfg.value ?? '').trim().slice(0, 1024);
  if (cfg.source === 'raw_payload') return getPayloadField(rawPayload, cfg.key);
  const fieldMap: Record<string, string> = {
    name: getPayloadField(rawPayload, 'name'),
    company: getPayloadField(rawPayload, 'company'),
    phone: getPayloadField(rawPayload, 'phone'),
    email: getPayloadField(rawPayload, 'email'),
    plan: getPayloadField(rawPayload, 'plan'),
    status: getPayloadField(rawPayload, 'status'),
    var1: getPayloadField(rawPayload, 'var1'),
    var2: getPayloadField(rawPayload, 'var2'),
    var3: getPayloadField(rawPayload, 'var3'),
  };
  if (cfg.source === 'field') return fieldMap[cfg.field] ?? '';
  return '';
}

/** Componentes Graph API para templates com parâmetros no BODY. */
export function buildGraphTemplateComponents(
  placeholderIndices: number[],
  mapping: TemplateVariablesConfig | null | undefined,
  rawPayload: Record<string, unknown>
): unknown[] {
  if (placeholderIndices.length === 0) return [];
  const parameters = placeholderIndices.map((n) => {
    const text = resolveSlotValue(String(n), mapping, rawPayload);
    return { type: 'text', text: text || '—' };
  });
  return [{ type: 'body', parameters }];
}

export function listEmptySlots(
  placeholderIndices: number[],
  mapping: TemplateVariablesConfig | null | undefined,
  rawPayload: Record<string, unknown>
): number[] {
  const empty: number[] = [];
  for (const n of placeholderIndices) {
    const v = resolveSlotValue(String(n), mapping, rawPayload).trim();
    if (!v || v === '—') empty.push(n);
  }
  return empty;
}
