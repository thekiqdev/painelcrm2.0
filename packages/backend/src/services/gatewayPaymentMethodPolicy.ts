/**
 * Política de métodos de pagamento por config de gateway (slugs minúsculos na API/DB).
 * Faturas e Asaas continuam usando PIX | BOLETO | CREDIT_CARD.
 */
export type GatewayPaymentMethodSlug = 'pix' | 'boleto' | 'credit_card';

export type UiPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export const GATEWAY_PAYMENT_METHOD_SLUGS: readonly GatewayPaymentMethodSlug[] = [
  'pix',
  'boleto',
  'credit_card',
] as const;

export const FALLBACK_UI_METHOD_ORDER: readonly UiPaymentMethod[] = ['PIX', 'BOLETO', 'CREDIT_CARD'];

const SLUG_SET = new Set<string>(GATEWAY_PAYMENT_METHOD_SLUGS);

const SLUG_TO_UI: Record<GatewayPaymentMethodSlug, UiPaymentMethod> = {
  pix: 'PIX',
  boleto: 'BOLETO',
  credit_card: 'CREDIT_CARD',
};

const UI_TO_SLUG: Record<UiPaymentMethod, GatewayPaymentMethodSlug> = {
  PIX: 'pix',
  BOLETO: 'boleto',
  CREDIT_CARD: 'credit_card',
};

export function normalizePaymentMethodSlug(raw: string | null | undefined): GatewayPaymentMethodSlug | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'pix' || s === 'boleto' || s === 'credit_card') return s;
  const up = String(raw).trim().toUpperCase();
  if (up === 'PIX' || up === 'BOLETO' || up === 'CREDIT_CARD') return UI_TO_SLUG[up as UiPaymentMethod];
  return null;
}

/** Lista única preservando ordem de primeira aparição. */
export function normalizeEnabledSlugList(input: string[] | null | undefined): GatewayPaymentMethodSlug[] {
  if (!Array.isArray(input) || input.length === 0) return [...GATEWAY_PAYMENT_METHOD_SLUGS];
  const out: GatewayPaymentMethodSlug[] = [];
  const seen = new Set<GatewayPaymentMethodSlug>();
  for (const x of input) {
    const s = normalizePaymentMethodSlug(x);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out.length > 0 ? out : [...GATEWAY_PAYMENT_METHOD_SLUGS];
}

export function parseEnabledPaymentMethodsFromDb(raw: unknown): GatewayPaymentMethodSlug[] {
  if (raw == null) return [...GATEWAY_PAYMENT_METHOD_SLUGS];
  if (Array.isArray(raw)) {
    return normalizeEnabledSlugList(raw.map((x) => String(x)));
  }
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) return normalizeEnabledSlugList(j.map((x) => String(x)));
    } catch {
      return [...GATEWAY_PAYMENT_METHOD_SLUGS];
    }
  }
  return [...GATEWAY_PAYMENT_METHOD_SLUGS];
}

export function slugsToUiMethods(slugs: GatewayPaymentMethodSlug[]): UiPaymentMethod[] {
  return slugs.map((s) => SLUG_TO_UI[s]);
}

export function uiMethodsToSlugs(methods: UiPaymentMethod[]): GatewayPaymentMethodSlug[] {
  return methods.map((m) => UI_TO_SLUG[m]);
}

export function pickFirstUiMethodByPreference(enabled: UiPaymentMethod[]): UiPaymentMethod {
  for (const pref of FALLBACK_UI_METHOD_ORDER) {
    if (enabled.includes(pref)) return pref;
  }
  return enabled[0] ?? 'BOLETO';
}

export function assertValidGatewayPaymentMethodConfig(
  enabledSlugs: GatewayPaymentMethodSlug[],
  defaultSlug: string | null
): void {
  if (enabledSlugs.length === 0) {
    throw new Error('Selecione pelo menos um método de pagamento.');
  }
  for (const s of enabledSlugs) {
    if (!SLUG_SET.has(s)) {
      throw new Error(`Método inválido: ${s}. Use apenas pix, boleto ou credit_card.`);
    }
  }
  if (defaultSlug != null && String(defaultSlug).trim() !== '') {
    const d = normalizePaymentMethodSlug(defaultSlug);
    if (!d) {
      throw new Error('Método padrão inválido. Use pix, boleto ou credit_card.');
    }
    if (!enabledSlugs.includes(d)) {
      throw new Error('O método padrão deve estar entre os métodos habilitados.');
    }
  }
}

export function resolveDefaultSlugForSave(params: {
  enabledSlugs: GatewayPaymentMethodSlug[];
  explicitDefault: string | null | undefined;
  previousDefault: string | null;
}): string | null {
  if (params.explicitDefault !== undefined) {
    if (params.explicitDefault === null || String(params.explicitDefault).trim() === '') {
      return null;
    }
    const d = normalizePaymentMethodSlug(params.explicitDefault);
    if (!d) {
      throw new Error('Método padrão inválido. Use pix, boleto ou credit_card.');
    }
    if (!params.enabledSlugs.includes(d)) {
      throw new Error('O método padrão deve estar entre os métodos habilitados.');
    }
    return d;
  }
  const prev = params.previousDefault ? normalizePaymentMethodSlug(params.previousDefault) : null;
  if (prev && params.enabledSlugs.includes(prev)) return prev;
  return null;
}

export function mergeGatewayPaymentFieldsForSave(params: {
  existingEnabledRaw: unknown;
  existingDefault: string | null;
  bodyEnabled: string[] | undefined;
  bodyDefault: string | null | undefined;
}): { enabledSlugs: GatewayPaymentMethodSlug[]; defaultSlug: string | null } {
  const existingEnabled = parseEnabledPaymentMethodsFromDb(params.existingEnabledRaw);
  if (params.bodyEnabled !== undefined && params.bodyEnabled.length === 0) {
    throw new Error('Selecione pelo menos um método de pagamento.');
  }
  const enabledSlugs =
    params.bodyEnabled !== undefined ? normalizeEnabledSlugList(params.bodyEnabled) : existingEnabled;

  const defaultSlug = resolveDefaultSlugForSave({
    enabledSlugs,
    explicitDefault: params.bodyDefault,
    previousDefault: params.existingDefault ?? null,
  });

  assertValidGatewayPaymentMethodConfig(enabledSlugs, defaultSlug);
  return { enabledSlugs, defaultSlug };
}

/** Política efetiva a partir de uma linha de config (ou fallback “todos habilitados”). */
export function paymentPolicyFromConfigRow(
  row: { enabled_payment_methods?: unknown; default_payment_method?: string | null } | null | undefined
): { enabledUi: UiPaymentMethod[]; defaultUi: UiPaymentMethod | null } {
  const { enabled_payment_methods, default_payment_method } = paymentMethodSlugsFromConfigRow(row);
  return {
    enabledUi: slugsToUiMethods(enabled_payment_methods),
    defaultUi:
      default_payment_method != null ? SLUG_TO_UI[default_payment_method] : null,
  };
}

export function paymentMethodSlugsFromConfigRow(
  row: { enabled_payment_methods?: unknown; default_payment_method?: string | null } | null | undefined
): { enabled_payment_methods: GatewayPaymentMethodSlug[]; default_payment_method: GatewayPaymentMethodSlug | null } {
  if (!row) {
    return { enabled_payment_methods: [...GATEWAY_PAYMENT_METHOD_SLUGS], default_payment_method: null };
  }
  const enabled_payment_methods = parseEnabledPaymentMethodsFromDb(row.enabled_payment_methods);
  const d = row.default_payment_method ? normalizePaymentMethodSlug(row.default_payment_method) : null;
  const default_payment_method =
    d && enabled_payment_methods.includes(d) ? d : null;
  return { enabled_payment_methods, default_payment_method };
}

/** Link público: combina o que foi gravado na fatura com o que o gateway permite hoje. */
export function mergePublicPayAllowedMethods(
  storedNormalized: UiPaymentMethod[] | null,
  gatewayRow: { enabled_payment_methods?: unknown; default_payment_method?: string | null } | null
): UiPaymentMethod[] {
  const { enabledUi } = paymentPolicyFromConfigRow(gatewayRow);
  if (!storedNormalized || storedNormalized.length === 0) {
    return [...enabledUi];
  }
  const g = new Set(enabledUi);
  const hit = storedNormalized.filter((m) => g.has(m));
  return hit.length > 0 ? hit : [...enabledUi];
}

/** Jobs / renovações: método explícito só se ainda habilitado; senão padrão do gateway ou ordem de fallback. */
export function resolveAutomaticInvoicePaymentMethod(
  explicit: string | null | undefined,
  gatewayRow: { enabled_payment_methods?: unknown; default_payment_method?: string | null } | null
): UiPaymentMethod {
  const policy = paymentPolicyFromConfigRow(gatewayRow);
  const ex =
    explicit === 'PIX' || explicit === 'BOLETO' || explicit === 'CREDIT_CARD' ? explicit : null;
  if (ex && policy.enabledUi.includes(ex)) return ex;
  if (policy.defaultUi && policy.enabledUi.includes(policy.defaultUi)) return policy.defaultUi;
  return pickFirstUiMethodByPreference(policy.enabledUi);
}
