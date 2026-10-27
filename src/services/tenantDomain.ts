import { apiClient } from '@/integrations/api/client';

export type TenantHostRole = 'store' | 'support';

export type TenantDomainInstructions = {
  id: string;
  tenant_id: string;
  hostname: string;
  role: TenantHostRole;
  status: string;
  verification_token: string;
  txt_host: string;
  txt_value: string;
  cname_host: string;
  cname_target: string;
  canonical_public_url?: string | null;
  bypass_enabled: boolean;
  cf_custom_hostname_id?: string | null;
  cf_ssl_status?: string | null;
  cf_ownership_status?: string | null;
  cf_last_sync_at?: string | null;
  cf_last_error?: string | null;
};

export type TenantDomainEmpty = {
  hostname: null;
  role: TenantHostRole;
  status: 'none';
};

export type VerifyTenantDomainResult = {
  verified: boolean;
  status: string;
  method: 'txt' | 'cname' | 'bypass' | 'none';
  instructions: TenantDomainInstructions | null;
};

export type TenantHostRowAdmin = {
  id: string;
  tenant_id: string;
  hostname: string;
  role: TenantHostRole | string;
  status: string;
  verification_token: string | null;
  verified_at: string | null;
  activated_at: string | null;
  last_check_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  cf_custom_hostname_id?: string | null;
  cf_ssl_status?: string | null;
  cf_ownership_status?: string | null;
  cf_last_sync_at?: string | null;
  cf_last_error?: string | null;
};

const BASE = '/api/me/tenant/domain';

export function tenantDomainRoleLabel(role: string): string {
  if (role === 'store') return 'Loja';
  if (role === 'support') return 'Abertura de chamados';
  return role;
}

export function tenantDomainStatusLabel(status: string): string {
  const map: Record<string, string> = {
    none: 'Não configurado',
    pending: 'Aguardando DNS',
    verified: 'Verificado',
    active: 'Ativo',
    error: 'Erro',
    failed: 'Falhou',
  };
  return map[status] || status;
}

/** TE3 — rótulos amigáveis do ssl.status Cloudflare */
export function tenantCfSslStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Não provisionado';
  const key = status.trim().toLowerCase();
  const map: Record<string, string> = {
    active: 'Ativo',
    pending_validation: 'Validando',
    pending_issuance: 'Emitindo certificado',
    pending_deployment: 'Publicando certificado',
    pending: 'Pendente',
    initializing: 'Iniciando',
    moved: 'Movido',
    deleted: 'Removido',
    expired: 'Expirado',
  };
  return map[key] || status;
}

export function isTenantCfSslPending(status: string | null | undefined): boolean {
  if (!status) return false;
  const key = status.trim().toLowerCase();
  return key !== 'active' && (key.startsWith('pending') || key === 'initializing');
}

export async function listMyTenantDomains(): Promise<{
  data?: { items: TenantDomainInstructions[] };
  error?: string;
  code?: string;
}> {
  return apiClient.get<{ items: TenantDomainInstructions[] }>(BASE);
}

export async function setMyTenantDomain(body: {
  hostname: string;
  role: TenantHostRole;
}): Promise<{ data?: TenantDomainInstructions; error?: string; code?: string }> {
  return apiClient.post<TenantDomainInstructions>(BASE, body);
}

export async function verifyMyTenantDomain(
  role: TenantHostRole
): Promise<{ data?: VerifyTenantDomainResult; error?: string; code?: string }> {
  return apiClient.post<VerifyTenantDomainResult>(`${BASE}/verify`, { role });
}

export async function syncMyTenantDomainCloudflare(
  role: TenantHostRole
): Promise<{ data?: TenantDomainInstructions; error?: string; code?: string }> {
  return apiClient.post<TenantDomainInstructions>(`${BASE}/cf-sync`, { role });
}

export async function changeMyTenantDomainRole(body: {
  from_role: TenantHostRole;
  to_role: TenantHostRole;
}): Promise<{ data?: TenantDomainInstructions; error?: string; code?: string }> {
  return apiClient.post<TenantDomainInstructions>(`${BASE}/change-role`, body);
}

export async function clearMyTenantDomain(opts: {
  role?: TenantHostRole;
  id?: string;
}): Promise<{ data?: { ok: true }; error?: string; code?: string }> {
  const q = opts.id
    ? `id=${encodeURIComponent(opts.id)}`
    : `role=${encodeURIComponent(opts.role || '')}`;
  return apiClient.delete<{ ok: true }>(`${BASE}?${q}`);
}

export async function superadminListTenantDomains(
  tenantId: string
): Promise<{ data?: { items: TenantHostRowAdmin[] }; error?: string }> {
  return apiClient.get<{ items: TenantHostRowAdmin[] }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/domain`
  );
}

export async function superadminClearTenantDomain(
  tenantId: string,
  opts: { role?: string; id?: string }
): Promise<{ data?: { ok: true }; error?: string }> {
  const q = opts.id
    ? `id=${encodeURIComponent(opts.id)}`
    : `role=${encodeURIComponent(opts.role || '')}`;
  return apiClient.delete<{ ok: true }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/domain?${q}`
  );
}

export async function superadminSyncTenantDomainCloudflare(
  tenantId: string,
  role: TenantHostRole
): Promise<{ data?: TenantDomainInstructions; error?: string; code?: string }> {
  return apiClient.post<TenantDomainInstructions>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/domain/cf-sync`,
    { role }
  );
}
