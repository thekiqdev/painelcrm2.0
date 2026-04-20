import { renderMessageTemplate } from '@/utils/renderMessageTemplate';

/** Espelha o backend (`packages/backend/src/utils/contractMergeFields.ts`). Manter em sincronia. */
export type ContractMergeEnrichedInput = {
  title: string;
  total_value: number | null | undefined;
  currency: string | null | undefined;
  start_date: string | null | undefined;
  end_date: string | null | undefined;
  variables: Record<string, unknown>;
  contract_number?: string | null;
  status?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  tenant?: {
    name?: string | null;
    domain?: string | null;
    slug?: string | null;
  } | null;
  client?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    cpf_cnpj?: string | null;
    status?: string | null;
    source?: string | null;
    funnel_stage?: string | null;
    notes?: string | null;
  } | null;
  operator?: {
    email?: string | null;
    whatsapp_number?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    profile_whatsapp?: string | null;
  } | null;
  signerPrimary?: {
    name: string;
    signed_at?: string | Date | null;
    signed: boolean;
  } | null;
  system?: { name?: string | null; baseUrl?: string | null };
  now?: Date;
};

export type ContractMergeInput = ContractMergeEnrichedInput;

const LEGACY_ALIASES: Record<string, string> = {
  'contract.startDate': 'contract.start_date',
  'contract.endDate': 'contract.end_date',
  'company.name': 'client.company',
  nome_cliente: 'client.name',
  email_cliente: 'client.email',
  cliente_nome: 'client.name',
  cliente_email: 'client.email',
  cpf_cnpj: 'client.document',
  cpf: 'client.document',
  cnpj: 'client.document',
  contract_title: 'contract.title',
  contract_num: 'contract.number',
  contract_number: 'contract.number',
};

function formatDatePtBr(isoDate: string | null | undefined): string {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatDateTimePtBr(value: string | Date | null | undefined): string {
  if (value == null) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatMoney(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const cur = (currency || 'BRL').trim() || 'BRL';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(Number(value));
  } catch {
    return String(value);
  }
}

function contractStatusLabelPt(status: string | null | undefined): string {
  const m: Record<string, string> = {
    DRAFT: 'Rascunho',
    PENDING_SIGNATURE: 'Pendente de assinatura',
    PARTIALLY_SIGNED: 'Assinatura parcial',
    ACTIVE: 'Ativo',
    INACTIVE: 'Inativo',
    EXPIRED: 'Expirado',
    CANCELLED: 'Cancelado',
  };
  if (!status) return '';
  return m[status] ?? status;
}

function monthNamePtBrUtc(d: Date): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(d);
  } catch {
    return '';
  }
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function defaultSystemBaseUrl(): string {
  try {
    const v = import.meta.env.VITE_FRONTEND_URL;
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

function defaultSystemName(): string {
  try {
    const v = import.meta.env.VITE_APP_PUBLIC_NAME;
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  return 'PainelCRM';
}

function applyLegacyAliases(ctx: Record<string, string>): void {
  for (const [alias, canonical] of Object.entries(LEGACY_ALIASES)) {
    if (Object.prototype.hasOwnProperty.call(ctx, alias)) continue;
    if (Object.prototype.hasOwnProperty.call(ctx, canonical)) {
      ctx[alias] = ctx[canonical] ?? '';
    }
  }
}

export function buildContractMergeContext(input: ContractMergeEnrichedInput): Record<string, string> {
  const now = input.now ?? new Date();
  const currency = (input.currency || 'BRL').trim() || 'BRL';
  const tv = input.total_value;

  const baseUrl = str(input.system?.baseUrl !== undefined ? input.system.baseUrl : defaultSystemBaseUrl());
  const sysName = str(input.system?.name !== undefined ? input.system.name : defaultSystemName());

  const ctx: Record<string, string> = {};

  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1;
  const isoDay = now.toISOString().slice(0, 10);

  ctx['system.name'] = sysName;
  ctx['system.url'] = baseUrl;
  ctx['system.date'] = isoDay;
  ctx['system.date_formatted'] = formatDatePtBr(isoDay);
  ctx['system.year'] = String(y);
  ctx['system.month'] = String(mo).padStart(2, '0');
  ctx['system.month_name'] = monthNamePtBrUtc(now);
  ctx['system.tenant_name'] = str(input.tenant?.name);
  ctx['system.tenant_domain'] = str(input.tenant?.domain);
  ctx['system.tenant_slug'] = str(input.tenant?.slug);

  ctx['contract.title'] = str(input.title);
  ctx['contract.number'] = str(input.contract_number);
  ctx['contract.status'] = str(input.status);
  ctx['contract.status_label'] = contractStatusLabelPt(input.status ?? null);
  ctx['contract.created_at'] = input.created_at != null ? new Date(input.created_at).toISOString() : '';
  ctx['contract.created_at_formatted'] =
    input.created_at != null ? formatDateTimePtBr(input.created_at) : '';
  ctx['contract.updated_at'] = input.updated_at != null ? new Date(input.updated_at).toISOString() : '';
  ctx['contract.updated_at_formatted'] =
    input.updated_at != null ? formatDateTimePtBr(input.updated_at) : '';
  ctx['contract.start_date'] = formatDatePtBr(input.start_date ?? null);
  ctx['contract.end_date'] = formatDatePtBr(input.end_date ?? null);
  ctx['contract.value'] = tv != null && Number.isFinite(Number(tv)) ? String(Number(tv)) : '';
  ctx['contract.value_formatted'] = formatMoney(tv ?? null, currency);

  const cl = input.client;
  ctx['client.name'] = str(cl?.name);
  ctx['client.company'] = str(cl?.company);
  ctx['client.email'] = str(cl?.email);
  ctx['client.phone'] = str(cl?.phone);
  ctx['client.whatsapp'] = str(cl?.phone);
  ctx['client.document'] = str(cl?.cpf_cnpj);
  ctx['client.status'] = str(cl?.status);
  ctx['client.source'] = str(cl?.source);
  ctx['client.funnel_stage'] = str(cl?.funnel_stage);
  ctx['client.notes'] = str(cl?.notes);

  const op = input.operator;
  const opFirst = str(op?.first_name);
  const opLast = str(op?.last_name);
  const opCombined = [opFirst, opLast].filter(Boolean).join(' ').trim();
  ctx['operator.name'] = opCombined || str(op?.email);
  ctx['operator.email'] = str(op?.email);
  const opPhone = str(op?.profile_whatsapp) || str(op?.whatsapp_number);
  ctx['operator.phone'] = opPhone;
  ctx['operator.company'] = str(op?.company_name);

  const sg = input.signerPrimary;
  ctx['signer.name'] = sg?.name ? str(sg.name) : '';
  ctx['signer.status'] = sg ? (sg.signed ? 'signed' : 'pending') : '';
  ctx['signer.status_label'] = sg ? (sg.signed ? 'Assinado' : 'Pendente') : '';
  ctx['signer.signed_at'] =
    sg?.signed_at != null ? new Date(sg.signed_at as string | Date).toISOString() : '';
  ctx['signer.signed_at_formatted'] = sg?.signed_at != null ? formatDateTimePtBr(sg.signed_at) : '';

  applyLegacyAliases(ctx);

  const vars = input.variables && typeof input.variables === 'object' ? input.variables : {};
  for (const [k, v] of Object.entries(vars)) {
    if (!k || k.includes('.')) continue;
    if (v == null) {
      ctx[k] = '';
      continue;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      ctx[k] = String(v);
      continue;
    }
    if (v instanceof Date) {
      ctx[k] = v.toISOString().slice(0, 10);
    }
  }

  return ctx;
}

export function applyContractMergeFieldsToHtml(html: string, input: ContractMergeEnrichedInput): string {
  const ctx = buildContractMergeContext(input);
  return renderMessageTemplate(html || '', ctx);
}

export function highlightUnresolvedPlaceholders(html: string): string {
  if (!html) return html;
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_full, key: string) => {
    return `<span class="contract-ph-unresolved">{{${key}}}</span>`;
  });
}
