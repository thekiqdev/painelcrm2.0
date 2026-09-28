import { apiClient } from '@/integrations/api/client';

export type GoogleCalendarStatusResponse = {
  enabled: boolean;
  connected: boolean;
  google_email: string | null;
  google_name?: string | null;
  google_picture?: string | null;
  connected_at?: string | null;
  encryption_configured?: boolean;
  oauth_configured?: boolean;
};

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatusResponse> {
  const res = await apiClient.get<GoogleCalendarStatusResponse>('/api/integrations/google/status');
  if (res.error) throw new Error(res.error);
  return (
    res.data ?? {
      enabled: false,
      connected: false,
      google_email: null,
    }
  );
}

export async function getGoogleCalendarConnectUrl(): Promise<string> {
  const res = await apiClient.get<{ url: string }>('/api/integrations/google/connect');
  if (res.error) throw new Error(res.error);
  if (!res.data?.url) throw new Error('Resposta inválida');
  return res.data.url;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const res = await apiClient.delete<{ ok?: boolean }>('/api/integrations/google/disconnect');
  if (res.error) throw new Error(res.error);
}
