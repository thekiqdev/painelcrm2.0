import { pool } from '../utils/db.js';
import {
  normalizeAppCurrency,
  SUPPORTED_APP_CURRENCIES,
  type AppCurrency,
} from '../i18n/appCurrency.js';

export const TENANT_CURRENCY_CATALOG = SUPPORTED_APP_CURRENCIES;

export type TenantLocalizationRow = {
  default_currency: string | null;
  enabled_currencies: string[] | null;
};

export type TenantLocalizationResolved = {
  available_currencies: AppCurrency[];
  enabled_currencies: AppCurrency[];
  default_currency: AppCurrency;
};

const DEFAULT_ENABLED: AppCurrency[] = [...SUPPORTED_APP_CURRENCIES];
const DEFAULT_CURRENCY: AppCurrency = 'BRL';

function uniqCurrencies(list: AppCurrency[]): AppCurrency[] {
  const seen = new Set<AppCurrency>();
  const out: AppCurrency[] = [];
  for (const c of list) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export function resolveTenantLocalization(
  raw: TenantLocalizationRow | null | undefined,
): TenantLocalizationResolved {
  const parsedEnabled = (raw?.enabled_currencies ?? [])
    .map((c) => normalizeAppCurrency(c))
    .filter((c): c is AppCurrency => c != null);
  const enabled = uniqCurrencies(parsedEnabled.length ? parsedEnabled : DEFAULT_ENABLED);
  const preferred = normalizeAppCurrency(raw?.default_currency);
  const default_currency =
    preferred && enabled.includes(preferred) ? preferred : enabled[0] ?? DEFAULT_CURRENCY;

  return {
    available_currencies: [...SUPPORTED_APP_CURRENCIES],
    enabled_currencies: enabled.includes(default_currency)
      ? enabled
      : uniqCurrencies([default_currency, ...enabled]),
    default_currency,
  };
}

export function normalizeLocalizationInput(input: {
  enabled_currencies: string[];
  default_currency: string;
}): { ok: true; value: { enabled_currencies: AppCurrency[]; default_currency: AppCurrency } } | { ok: false; error: string } {
  const enabled = uniqCurrencies(
    (input.enabled_currencies ?? [])
      .map((c) => normalizeAppCurrency(c))
      .filter((c): c is AppCurrency => c != null),
  );
  if (!enabled.length) {
    return { ok: false, error: 'Selecione ao menos uma moeda' };
  }
  const def = normalizeAppCurrency(input.default_currency);
  if (!def || !enabled.includes(def)) {
    return { ok: false, error: 'A moeda padrão precisa estar habilitada' };
  }
  return { ok: true, value: { enabled_currencies: enabled, default_currency: def } };
}

export async function getTenantLocalization(tenantId: string): Promise<TenantLocalizationRow | null> {
  const r = await pool.query<TenantLocalizationRow>(
    `SELECT default_currency, enabled_currencies
     FROM tenants
     WHERE id = $1`,
    [tenantId],
  );
  return r.rows[0] ?? null;
}

export async function updateTenantLocalization(
  tenantId: string,
  input: { enabled_currencies: AppCurrency[]; default_currency: AppCurrency },
): Promise<TenantLocalizationResolved> {
  await pool.query(
    `UPDATE tenants
     SET default_currency = $2,
         enabled_currencies = $3::text[],
         updated_at = now()
     WHERE id = $1`,
    [tenantId, input.default_currency, input.enabled_currencies],
  );
  return resolveTenantLocalization({
    default_currency: input.default_currency,
    enabled_currencies: input.enabled_currencies,
  });
}
