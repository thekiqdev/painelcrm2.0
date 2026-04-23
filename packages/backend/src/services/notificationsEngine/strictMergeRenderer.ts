/**
 * Renderização strict de templates {{namespace.field}}.
 * - Placeholder deve existir na whitelist (merge_fields do evento).
 * - Cada placeholder deve existir no contexto (valor pode ser string vazia).
 */

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export type StrictRenderResult =
  | { ok: true; subject: string | null; body: string }
  | {
      ok: false;
      error: string;
      disallowedPlaceholders?: string[];
      missingKeys?: string[];
    };

export function extractPlaceholders(text: string): string[] {
  if (!text) return [];
  const keys = new Set<string>();
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    keys.add(m[1]!);
  }
  return [...keys];
}

function renderWithContext(template: string, context: Record<string, string>): string {
  if (!template) return '';
  return template.replace(PLACEHOLDER_RE, (_full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(context, key)) {
      return `{{${key}}}`;
    }
    const v = context[key];
    if (v == null) return '';
    return String(v);
  });
}

export function renderStrictTemplates(params: {
  subjectTemplate: string | null | undefined;
  bodyTemplate: string;
  context: Record<string, string>;
  allowedMergeFields: string[];
}): StrictRenderResult {
  const allowed = new Set(params.allowedMergeFields);
  const subjectTpl = params.subjectTemplate ?? null;
  const bodyTpl = params.bodyTemplate ?? '';

  const subjectKeys = subjectTpl ? extractPlaceholders(subjectTpl) : [];
  const bodyKeys = extractPlaceholders(bodyTpl);
  const allKeys = [...new Set([...subjectKeys, ...bodyKeys])];

  const disallowed = allKeys.filter((k) => !allowed.has(k));
  if (disallowed.length > 0) {
    return {
      ok: false,
      error: 'Template contém placeholders fora da whitelist do evento.',
      disallowedPlaceholders: disallowed,
    };
  }

  const missing: string[] = [];
  for (const k of allKeys) {
    if (!Object.prototype.hasOwnProperty.call(params.context, k)) {
      missing.push(k);
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: 'Contexto incompleto para placeholders do template (modo strict).',
      missingKeys: missing,
    };
  }

  const renderedBody = renderWithContext(bodyTpl, params.context);
  const renderedSubject = subjectTpl ? renderWithContext(subjectTpl, params.context) : null;

  return { ok: true, subject: renderedSubject, body: renderedBody };
}
