import { apiClient } from '@/integrations/api/client';

/** SSOT Pix Automático — espelha `getPixAutomaticPreferenceForTenant`. */
export type PixAutomaticPreference = {
  available: boolean;
  status: string | null;
  has_active: boolean;
  switch_on: boolean;
  /** Opt-out persistido na assinatura — não reaplicar default ON. */
  user_opted_off?: boolean;
  authorization_id: string | null;
  qr_payload: string | null;
  qr_image: string | null;
  subscription_id: string | null;
};

export async function getMyPixAutomatic(): Promise<{
  data?: { ok: true; pix_automatic: PixAutomaticPreference };
  error?: string;
}> {
  return apiClient.get<{ ok: true; pix_automatic: PixAutomaticPreference }>(
    '/api/me/tenant/pix-automatic'
  );
}

export async function enableMyPixAutomatic(billingId?: string | null): Promise<{
  data?: {
    ok: true;
    authorization_id: string;
    status: string;
    pix_copy_paste: string | null;
    pix_qr_code: string | null;
    billing_id: string;
  };
  error?: string;
  code?: string;
}> {
  const res = await apiClient.post<{
    ok: boolean;
    authorization_id?: string;
    status?: string;
    pix_copy_paste?: string | null;
    pix_qr_code?: string | null;
    billing_id?: string;
    error?: string;
    code?: string;
  }>('/api/me/tenant/pix-automatic/enable', {
    billing_id: billingId ?? null,
  });
  if (res.error || !res.data?.ok) {
    return {
      error: res.error || res.data?.error || 'Falha ao ativar Pix Automático',
      code: res.data?.code,
    };
  }
  return {
    data: {
      ok: true,
      authorization_id: res.data.authorization_id!,
      status: res.data.status!,
      pix_copy_paste: res.data.pix_copy_paste ?? null,
      pix_qr_code: res.data.pix_qr_code ?? null,
      billing_id: res.data.billing_id!,
    },
  };
}

export async function disableMyPixAutomatic(billingId?: string | null): Promise<{
  data?: {
    ok: true;
    detail: string;
    pix_automatic: PixAutomaticPreference;
    pix_copy_paste: string | null;
    pix_qr_code: string | null;
    billing_id: string | null;
  };
  error?: string;
}> {
  const res = await apiClient.post<{
    ok: boolean;
    detail?: string;
    pix_automatic?: PixAutomaticPreference;
    pix_copy_paste?: string | null;
    pix_qr_code?: string | null;
    billing_id?: string | null;
    error?: string;
  }>('/api/me/tenant/pix-automatic/disable', {
    billing_id: billingId ?? null,
  });
  if (res.error || !res.data?.ok) {
    return { error: res.error || res.data?.error || 'Falha ao desativar Pix Automático' };
  }
  return {
    data: {
      ok: true,
      detail: res.data.detail ?? 'cancelled',
      pix_automatic: res.data.pix_automatic!,
      pix_copy_paste: res.data.pix_copy_paste ?? null,
      pix_qr_code: res.data.pix_qr_code ?? null,
      billing_id: res.data.billing_id ?? null,
    },
  };
}
