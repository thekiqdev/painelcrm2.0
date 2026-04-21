import { apiClient } from '@/integrations/api/client';

export type ProposalWebhookEventKey =
  | 'proposal.public_accepted'
  | 'proposal.public_rejected'
  | 'proposal.invoiced';

export interface ProposalWebhookSettingsDto {
  tenant_id: string;
  enabled: boolean;
  webhook_url: string | null;
  event_keys: string[];
  has_secret: boolean;
  updated_at: string;
}

export interface ProposalWebhookSettingsResponse {
  settings: ProposalWebhookSettingsDto | null;
  encryption_configured: boolean;
  allowed_event_keys: ProposalWebhookEventKey[];
}

export async function getProposalWebhookSettings(): Promise<ProposalWebhookSettingsResponse> {
  const response = await apiClient.get<ProposalWebhookSettingsResponse>('/api/me/tenant/proposal-webhook-settings');
  if (response.error) throw new Error(response.error);
  if (!response.data) throw new Error('Resposta inválida');
  return response.data;
}

export async function putProposalWebhookSettings(body: {
  enabled: boolean;
  webhook_url?: string | null;
  event_keys: ProposalWebhookEventKey[];
  secret?: string | null;
}): Promise<ProposalWebhookSettingsResponse> {
  const response = await apiClient.put<ProposalWebhookSettingsResponse>(
    '/api/me/tenant/proposal-webhook-settings',
    body
  );
  if (response.error) throw new Error(response.error);
  if (!response.data) throw new Error('Resposta inválida');
  return response.data;
}

export async function retryProposalWebhookDelivery(deliveryId: string): Promise<void> {
  const response = await apiClient.post<{ ok: boolean }>(
    `/api/me/tenant/proposal-webhook-deliveries/${encodeURIComponent(deliveryId)}/retry`,
    {}
  );
  if (response.error) throw new Error(response.error);
}
