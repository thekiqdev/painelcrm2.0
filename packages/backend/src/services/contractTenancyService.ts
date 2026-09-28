/**
 * Regras de vigência copiadas do modelo para o contrato (snapshot em JSON).
 * Cálculo de datas: base em data de criação do contrato ou na conclusão da assinatura (contrato ACTIVE).
 */

export type ContractTenancyDateBase = 'creation_date' | 'signature_date';
export type ContractTenancyStartRule = 'same_day' | 'plus_days';

export type ContractTenancyRules = {
  date_base_type?: ContractTenancyDateBase | null;
  start_rule_type?: ContractTenancyStartRule | null;
  start_offset_days?: number | null;
  duration_days?: number | null;
};

function startOfUtcCalendarDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(base: Date, days: number): Date {
  const t = new Date(base.getTime());
  t.setUTCDate(t.getUTCDate() + days);
  return t;
}

function toIsoDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseContractTenancyRules(raw: unknown): ContractTenancyRules | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const date_base_type = o.date_base_type;
  const start_rule_type = o.start_rule_type;
  const start_offset_days = o.start_offset_days;
  const duration_days = o.duration_days;

  const rules: ContractTenancyRules = {};
  if (date_base_type === 'creation_date' || date_base_type === 'signature_date') {
    rules.date_base_type = date_base_type;
  }
  if (start_rule_type === 'same_day' || start_rule_type === 'plus_days') {
    rules.start_rule_type = start_rule_type;
  }
  if (typeof start_offset_days === 'number' && Number.isFinite(start_offset_days) && start_offset_days >= 0) {
    rules.start_offset_days = Math.floor(start_offset_days);
  }
  if (typeof duration_days === 'number' && Number.isFinite(duration_days) && duration_days >= 1) {
    rules.duration_days = Math.floor(duration_days);
  }
  if (!rules.date_base_type || rules.duration_days == null) return null;
  return rules;
}

/**
 * Calcula início e fim (DATE ISO YYYY-MM-DD) a partir da âncora (instante).
 */
export function computeTenancyDates(rules: ContractTenancyRules, anchor: Date): { start: string; end: string } | null {
  if (!rules.date_base_type || rules.duration_days == null) return null;

  const anchorDay = startOfUtcCalendarDay(anchor);
  const startRule = rules.start_rule_type ?? 'same_day';
  const offset = Math.max(0, Math.floor(rules.start_offset_days ?? 0));

  let startDay = anchorDay;
  if (startRule === 'plus_days') {
    startDay = addUtcDays(anchorDay, offset);
  }

  const endDay = addUtcDays(startDay, rules.duration_days);
  return { start: toIsoDateOnly(startDay), end: toIsoDateOnly(endDay) };
}

export function computeCreationTenancyDates(rulesJson: unknown, createdAt: Date): { start: string; end: string } | null {
  const rules = parseContractTenancyRules(rulesJson);
  if (!rules || rules.date_base_type !== 'creation_date') return null;
  return computeTenancyDates(rules, createdAt);
}

export function computeSignatureTenancyDates(rulesJson: unknown, signedAt: Date): { start: string; end: string } | null {
  const rules = parseContractTenancyRules(rulesJson);
  if (!rules || rules.date_base_type !== 'signature_date') return null;
  return computeTenancyDates(rules, signedAt);
}
