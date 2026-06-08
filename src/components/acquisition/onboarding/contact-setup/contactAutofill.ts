import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import type { AcquisitionSignupFormState } from '../types';

export type ContactAutofillSource = {
  lead_name?: string | null;
  lead_email?: string | null;
  lead_phone?: string | null;
};

function pickPhone(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return '';
  return formatPhoneBrDigits(digits);
}

/** Preenche apenas campos vazios — não sobrescreve edição do usuário. */
export function mergeContactAutofill(
  current: AcquisitionSignupFormState,
  ...sources: ContactAutofillSource[]
): AcquisitionSignupFormState {
  let name = current.lead_name;
  let email = current.lead_email;
  let phone = current.lead_phone;

  for (const src of sources) {
    if (!name.trim() && src.lead_name?.trim()) name = src.lead_name.trim();
    if (!email.trim() && src.lead_email?.trim()) email = src.lead_email.trim();
    if (!phone.replace(/\D/g, '').length) {
      const p = pickPhone(src.lead_phone);
      if (p) phone = p;
    }
  }

  if (name === current.lead_name && email === current.lead_email && phone === current.lead_phone) {
    return current;
  }
  return { ...current, lead_name: name, lead_email: email, lead_phone: phone };
}

export function contactAutofillFromSearchParams(params: URLSearchParams): ContactAutofillSource {
  return {
    lead_name: params.get('name') ?? params.get('nome') ?? params.get('lead_name') ?? undefined,
    lead_email: params.get('email') ?? undefined,
    lead_phone: params.get('phone') ?? params.get('whatsapp') ?? params.get('tel') ?? undefined,
  };
}

export function contactAutofillFromUser(user: {
  email?: string;
  first_name?: string;
  last_name?: string;
  whatsapp_number?: string;
} | null): ContactAutofillSource {
  if (!user) return {};
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return {
    lead_name: name || undefined,
    lead_email: user.email || undefined,
    lead_phone: user.whatsapp_number || undefined,
  };
}
