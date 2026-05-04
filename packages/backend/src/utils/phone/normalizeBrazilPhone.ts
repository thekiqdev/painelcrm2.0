/**
 * Normaliza telefone brasileiro para envio WhatsApp Cloud API (Meta): apenas dígitos, `{DDI}{DDD}{assinante}`.
 * Formato de saída: `55` + DDD (2) + 8 (fixo) ou 9 (celular) dígitos locais → 12 ou 13 dígitos totais.
 */

export type NormalizeBrazilWhatsappPhoneResult = {
  ok: boolean;
  phone?: string;
  reason?: string;
  original: string;
};

/** Fixos costumam iniciar com 2–5 no número local (8 dígitos após o DDD). */
function isBrazilLandlineLocalFirstDigit(d: string): boolean {
  const c = d[2];
  return c !== undefined && '2345'.includes(c);
}

/**
 * Regra do 9º dígito (celular): números nacionais com 10 dígitos (DDD + 8) cuja parte local não é fixo
 * recebem `9` após o DDD. Fixos (primeiro dígitos 2–5) mantêm 8 dígitos locais.
 */
function normalizeBrazilNationalTenDigits(d: string): string | null {
  if (d.length !== 10) return null;
  if (isBrazilLandlineLocalFirstDigit(d)) return d;
  return `${d.slice(0, 2)}9${d.slice(2)}`;
}

function isPlausibleDdd(ddd: number): boolean {
  return ddd >= 11 && ddd <= 99;
}

function validateFinalBrazilInternational(phone: string): boolean {
  if (!/^55\d{10,11}$/.test(phone)) return false;
  const ddd = parseInt(phone.slice(2, 4), 10);
  return isPlausibleDdd(ddd);
}

function finalizeInternational55(digitsWith55: string, displayOriginal: string): NormalizeBrazilWhatsappPhoneResult {
  const rest = digitsWith55.slice(2);

  if (rest.length === 10) {
    const national = normalizeBrazilNationalTenDigits(rest);
    if (!national) {
      return { ok: false, original: displayOriginal, reason: 'invalid_national_after_55' };
    }
    const phone = `55${national}`;
    return validateFinalBrazilInternational(phone)
      ? { ok: true, original: displayOriginal, phone }
      : { ok: false, original: displayOriginal, reason: 'invalid_ddd' };
  }

  if (rest.length === 11) {
    if (rest[2] !== '9') {
      return { ok: false, original: displayOriginal, reason: 'mobile_must_have_9_after_ddd' };
    }
    return validateFinalBrazilInternational(digitsWith55)
      ? { ok: true, original: displayOriginal, phone: digitsWith55 }
      : { ok: false, original: displayOriginal, reason: 'invalid_ddd' };
  }

  if (rest.length < 10) {
    return { ok: false, original: displayOriginal, reason: 'incomplete_after_55' };
  }

  return { ok: false, original: displayOriginal, reason: 'too_many_digits' };
}

/**
 * Normaliza entrada de telefone BR para dígitos internacionais sem `+` (ex.: `5511999999999`).
 */
export function normalizeBrazilWhatsappPhone(input: string): NormalizeBrazilWhatsappPhoneResult {
  const original = input == null ? '' : String(input);
  if (!original.trim()) {
    return { ok: false, original, reason: 'empty' };
  }

  let d = original.replace(/\D/g, '');
  if (!d) {
    return { ok: false, original, reason: 'no_digits' };
  }

  while (d.startsWith('0') && d.length > 1) {
    d = d.slice(1);
  }

  if (d.startsWith('5555') && d.length >= 14) {
    d = d.slice(2);
  }

  if (d.startsWith('55')) {
    return finalizeInternational55(d, original);
  }

  if (d.length === 10) {
    const national = normalizeBrazilNationalTenDigits(d);
    if (!national) {
      return { ok: false, original, reason: 'invalid_national' };
    }
    const phone = `55${national}`;
    return validateFinalBrazilInternational(phone)
      ? { ok: true, original, phone }
      : { ok: false, original, reason: 'invalid_ddd' };
  }

  if (d.length === 11) {
    if (d[2] !== '9') {
      return { ok: false, original, reason: 'invalid_mobile_national' };
    }
    const phone = `55${d}`;
    return validateFinalBrazilInternational(phone)
      ? { ok: true, original, phone }
      : { ok: false, original, reason: 'invalid_ddd' };
  }

  return { ok: false, original, reason: 'unsupported_length' };
}
