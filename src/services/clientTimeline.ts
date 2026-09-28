import { apiClient } from '@/integrations/api/client';
import type { CreateClientTimelineEventBody } from './clients';

/**
 * POST /api/clients/:id/timeline/events — módulo dedicado para o Vite não depender de export nomeado
 * no mesmo chunk que `clientsService` (evita erro de export ausente no pré-bundle).
 */
export async function recordClientTimelineEvent(
  clientId: string,
  body: CreateClientTimelineEventBody
): Promise<void> {
  const response = await apiClient.post<{ ok: boolean }>(`/api/clients/${clientId}/timeline/events`, body);
  if (response.error) throw new Error(response.error);
}
