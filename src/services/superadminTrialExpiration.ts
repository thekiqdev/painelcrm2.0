import { apiClient } from '@/integrations/api/client';

export type TrialExpirationResult = {
  suspended: number;
  lifecycle_events: number;
  promotions_executed: number;
};

export type TrialExpirationExecuteResponse = {
  ok: boolean;
  result: TrialExpirationResult;
};

export async function executeSuperadminTrialExpiration(): Promise<TrialExpirationExecuteResponse> {
  const res = await apiClient.post<TrialExpirationExecuteResponse>(
    '/api/superadmin/advanced/trial-expiration/execute',
    {},
  );
  return res.data;
}
