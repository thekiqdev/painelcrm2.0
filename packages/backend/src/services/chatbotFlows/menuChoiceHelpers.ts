/**
 * Helpers do nó menu_choice (S13) — choices UazAPI + match de reply.
 */

export type MenuChoiceOption = {
  id: string;
  label: string;
  description?: string;
  section?: string;
  set_variables?: Array<{ name: string; value: string }>;
};

export const MENU_CHOICE_RETRIES_KEY = 'menu._assist_retries';

export function normalizeMenuOptions(raw: unknown): MenuChoiceOption[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuChoiceOption[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 64);
    const label = String(o.label || '').trim().slice(0, 24);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const setVarsRaw = Array.isArray(o.set_variables) ? o.set_variables : [];
    const set_variables = setVarsRaw
      .map((sv) => {
        if (!sv || typeof sv !== 'object') return null;
        const s = sv as Record<string, unknown>;
        const name = String(s.name || '').trim();
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return null;
        return { name, value: String(s.value ?? '') };
      })
      .filter(Boolean) as Array<{ name: string; value: string }>;
    out.push({
      id,
      label,
      description: String(o.description || '').trim().slice(0, 72),
      section: String(o.section || '').trim().slice(0, 24),
      set_variables,
    });
  }
  return out;
}

/** Monta `choices` no formato UazAPI `/send/menu`. */
export function buildUazMenuChoices(
  mode: 'button' | 'list',
  options: MenuChoiceOption[]
): string[] {
  if (mode === 'button') {
    return options.map((o) => `${o.label}|${o.id}`);
  }
  const choices: string[] = [];
  let lastSection = '';
  for (const o of options) {
    const sec = o.section || '';
    if (sec && sec !== lastSection) {
      choices.push(`[${sec}]`);
      lastSection = sec;
    }
    const desc = o.description || '';
    choices.push(desc ? `${o.label}|${o.id}|${desc}` : `${o.label}|${o.id}`);
  }
  return choices;
}

/** Texto numerado (fallback se /send/menu falhar). */
export function buildMenuTextFallback(prompt: string, options: MenuChoiceOption[]): string {
  const lines = options.map((o, i) => `${i + 1}) ${o.label}`);
  const body = prompt.trim();
  return body ? `${body}\n\n${lines.join('\n')}` : lines.join('\n');
}

export function matchMenuOption(
  options: MenuChoiceOption[],
  reply: string
): MenuChoiceOption | null {
  const t = String(reply || '').trim();
  if (!t || options.length === 0) return null;
  const lower = t.toLowerCase();
  const byId = options.find((o) => o.id.toLowerCase() === lower);
  if (byId) return byId;
  const byLabel = options.find((o) => o.label.toLowerCase() === lower);
  if (byLabel) return byLabel;
  const m = t.match(/^(\d{1,2})\b/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= options.length) return options[n - 1]!;
  }
  return null;
}

export function outHandlesForMenuChoice(data: Record<string, unknown>): string[] {
  const opts = normalizeMenuOptions(data.options);
  return [...opts.map((o) => o.id), 'fallback'];
}
