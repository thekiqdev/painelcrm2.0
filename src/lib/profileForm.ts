import { normalizeCatalogMediaUrlForBrowser } from '@/services/catalogMediaUpload';
import type { MeBusinessPutPayload, MeBusinessTenantDto, MePersonalDto } from '@/services/profile';

export function mapBusinessToForm(b: MeBusinessTenantDto) {
  return {
    name: (b.name ?? '').trim(),
    company_legal_name: (b.company_legal_name ?? '').trim(),
    cpf_cnpj: (b.cpf_cnpj ?? '').trim(),
    company_email: (b.company_email ?? '').trim(),
    company_whatsapp: (b.company_whatsapp ?? '').trim(),
    company_website: (b.company_website ?? '').trim(),
    company_postal_code: (b.company_postal_code ?? '').trim(),
    company_street: (b.company_street ?? '').trim(),
    company_number: (b.company_number ?? '').trim(),
    company_district: (b.company_district ?? '').trim(),
    company_city: (b.company_city ?? '').trim(),
    company_state: (b.company_state ?? '').trim(),
    company_address_line: (b.company_address_line ?? '').trim(),
    logo_light_url: b.logo_light_url?.trim() ? normalizeCatalogMediaUrlForBrowser(b.logo_light_url.trim()) : null,
    logo_dark_url: b.logo_dark_url?.trim() ? normalizeCatalogMediaUrlForBrowser(b.logo_dark_url.trim()) : null,
  };
}

export type BusinessFormState = ReturnType<typeof mapBusinessToForm>;

export function toBusinessPutPayload(f: BusinessFormState): MeBusinessPutPayload {
  return {
    name: f.name || undefined,
    company_legal_name: f.company_legal_name || null,
    cpf_cnpj: f.cpf_cnpj || null,
    company_email: f.company_email || null,
    company_whatsapp: f.company_whatsapp || null,
    company_website: f.company_website || null,
    company_postal_code: f.company_postal_code || null,
    company_street: f.company_street || null,
    company_number: f.company_number || null,
    company_district: f.company_district || null,
    company_city: f.company_city || null,
    company_state: f.company_state || null,
    company_address_line: f.company_address_line || null,
    logo_light_url: f.logo_light_url,
    logo_dark_url: f.logo_dark_url,
  };
}

export function companyFieldsPayload(f: BusinessFormState): MeBusinessPutPayload {
  return {
    name: f.name || undefined,
    company_legal_name: f.company_legal_name || null,
    cpf_cnpj: f.cpf_cnpj || null,
    company_email: f.company_email || null,
    company_whatsapp: f.company_whatsapp || null,
    company_website: f.company_website || null,
  };
}

export function addressFieldsPayload(f: BusinessFormState): MeBusinessPutPayload {
  return {
    company_postal_code: f.company_postal_code || null,
    company_street: f.company_street || null,
    company_number: f.company_number || null,
    company_district: f.company_district || null,
    company_city: f.company_city || null,
    company_state: f.company_state || null,
    company_address_line: f.company_address_line || null,
  };
}

export function personalDisplayName(p: MePersonalDto): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
}

export function splitFullName(fullName: string): { first_name: string | null; last_name: string | null } {
  const t = fullName.trim();
  if (!t) return { first_name: null, last_name: null };
  const i = t.indexOf(' ');
  if (i === -1) return { first_name: t, last_name: null };
  return { first_name: t.slice(0, i), last_name: t.slice(i + 1).trim() || null };
}

export function initialsFromPersonal(p: MePersonalDto | null): string {
  if (!p) return 'U';
  return initialsFromFullName(personalDisplayName(p));
}

export function initialsFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  const a = parts[0].charAt(0);
  const b = (parts.length > 1 ? parts[parts.length - 1].charAt(0) : parts[0].charAt(1)) || '';
  return (a + b).toUpperCase() || 'U';
}

/** Critério: nome (≥2), e-mail preenchido, WhatsApp BR válido (10–13 dígitos). Avatar e cargo são opcionais. */
/** @deprecated Prefer `getPersonalProfileCompletion`; mantido para compatibilidade. */
export function isPersonalProfileComplete(fullNameTrimmed: string, whatsappDigits: string, emailTrimmed = ''): boolean {
  return getPersonalProfileCompletion({
    fullName: fullNameTrimmed,
    email: emailTrimmed,
    whatsappDigits,
    avatarUrl: null,
    jobTitle: '',
  }).complete;
}

export function getPersonalProfileCompletion(params: {
  fullName: string;
  email: string;
  whatsappDigits: string;
  avatarUrl: string | null;
  jobTitle: string;
}): { complete: boolean; percent: number } {
  const wa = params.whatsappDigits.replace(/\D/g, '');
  const hasName = params.fullName.trim().length >= 2;
  const hasEmail = params.email.trim().length > 0;
  const hasWa = wa.length >= 10 && wa.length <= 13;
  const complete = hasName && hasEmail && hasWa;

  let pct = 0;
  if (hasName) pct += 25;
  if (hasEmail) pct += 25;
  if (hasWa) pct += 25;
  if (params.avatarUrl) pct += 12.5;
  if (params.jobTitle.trim()) pct += 12.5;
  return { complete, percent: Math.round(pct) };
}
