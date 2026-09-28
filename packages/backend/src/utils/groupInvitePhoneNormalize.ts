/** Normalização de MSISDN para convites / criação de grupo UazAPI (apenas dígitos). */

export function digitsOnlyMsisdn(input: string): string {
  return String(input || '').replace(/\D/g, '');
}

export function extractDigitsFromWhatsAppPnJid(jid: string | null | undefined): string | null {
  const s = String(jid || '').trim();
  if (!s.toLowerCase().endsWith('@s.whatsapp.net')) return null;
  const d = digitsOnlyMsisdn(s.split('@')[0] || '');
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

export type NormalizePhoneResult = { ok: true; digits: string } | { ok: false; error: string };

/**
 * - Remove não-dígitos
 * - BR sem 55: prefixa 55 quando 10–11 dígitos
 * - BR: 55 + DDD (11–99) + 8 ou 9 dígitos
 * - Internacional: 10–15 dígitos sem 55
 */
export function normalizeParticipantPhoneForUazApi(
  input: string,
  instanceOwnerDigits: string | null
): NormalizePhoneResult {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'Número vazio' };
  let d = digitsOnlyMsisdn(raw);
  if (!d) return { ok: false, error: 'Número inválido' };

  if (d.length >= 10 && d.length <= 11 && !d.startsWith('55')) {
    d = `55${d}`;
  }

  if (d.startsWith('55')) {
    const rest = d.slice(2);
    if (rest.length < 10 || rest.length > 11) {
      return { ok: false, error: 'Telefone brasileiro inválido (quantidade de dígitos)' };
    }
    const ddd = parseInt(rest.slice(0, 2), 10);
    if (Number.isNaN(ddd) || ddd < 11 || ddd > 99) {
      return { ok: false, error: 'DDD inválido' };
    }
  } else if (d.length < 10 || d.length > 15) {
    return { ok: false, error: 'Número internacional inválido' };
  }

  if (instanceOwnerDigits && d === instanceOwnerDigits) {
    return { ok: false, error: 'Não pode ser o número da própria instância WhatsApp' };
  }

  return { ok: true, digits: d };
}

export function mergeUniqueParticipantPhones(
  phones: string[],
  instanceOwnerDigits: string | null
): { ok: true; list: string[] } | { ok: false; error: string } {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of phones) {
    const n = normalizeParticipantPhoneForUazApi(p, instanceOwnerDigits);
    if (!n.ok) return n;
    if (seen.has(n.digits)) continue;
    seen.add(n.digits);
    out.push(n.digits);
  }
  return { ok: true, list: out };
}

/** Telefone principal da conversa 1:1 (JID PN, colunas ou canonical). */
export function resolveConversationPrimaryMsisdn(
  row: {
    external_chat_id: string;
    canonical_phone: string | null;
    phone_number: string | null;
  },
  instanceOwnerDigits: string | null
): string | null {
  const tryNorm = (raw: string | null | undefined): string | null => {
    if (!raw?.trim()) return null;
    const j = extractDigitsFromWhatsAppPnJid(raw);
    if (j) {
      const v = normalizeParticipantPhoneForUazApi(j, instanceOwnerDigits);
      return v.ok ? v.digits : null;
    }
    const v = normalizeParticipantPhoneForUazApi(raw, instanceOwnerDigits);
    return v.ok ? v.digits : null;
  };

  return (
    tryNorm(row.external_chat_id) ||
    tryNorm(row.canonical_phone) ||
    tryNorm(row.phone_number) ||
    null
  );
}
