import { apiClient } from '@/integrations/api/client';

export const API_KEYS_QUERY_KEY = ['integrations', 'api-keys'] as const;

export type TenantApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type TenantApiKeyCreated = TenantApiKey & { key: string };

export class ApiKeysRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiKeysRequestError';
    this.status = status;
    this.code = code;
  }
}

function throwFromResponse(error: string, details: { status?: number } | undefined, code?: string): never {
  throw new ApiKeysRequestError(error, Number(details?.status ?? 0), code);
}

export function isApiKeysDisabledError(error: unknown): boolean {
  if (!(error instanceof ApiKeysRequestError)) return false;
  return error.status === 404 || error.code === 'API_KEYS_DISABLED';
}

export async function listTenantApiKeys(): Promise<TenantApiKey[]> {
  const res = await apiClient.get<{ keys: TenantApiKey[] }>('/api/integrations/api-keys');
  if (res.error) throwFromResponse(res.error, res.details, res.code);
  return res.data?.keys ?? [];
}

export async function createTenantApiKey(name: string): Promise<TenantApiKeyCreated> {
  const res = await apiClient.post<TenantApiKeyCreated>('/api/integrations/api-keys', { name });
  if (res.error) throwFromResponse(res.error, res.details, res.code);
  if (!res.data?.key) throw new ApiKeysRequestError('Resposta inválida', 500);
  return res.data;
}

export async function revokeTenantApiKey(id: string): Promise<TenantApiKey> {
  const res = await apiClient.delete<TenantApiKey>(`/api/integrations/api-keys/${id}`);
  if (res.error) throwFromResponse(res.error, res.details, res.code);
  if (!res.data) throw new ApiKeysRequestError('Resposta inválida', 500);
  return res.data;
}
