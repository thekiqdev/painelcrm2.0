/**
 * @deprecated Tenant não é mais criado na ativação — use prepareAcquisitionTrialActivation.
 */
import { prepareAcquisitionTrialActivation } from '../acquisition/acquisitionActivationPrepareService.js';

export type ActivateAcquisitionTrialInput = {
  acquisitionLeadId: string;
  usersCount?: number;
  correlationId?: string;
  grantExtraTrial?: boolean;
  avatarDataUrl?: string | null;
  avatarUrl?: string | null;
};

export type ActivateAcquisitionTrialResult =
  | {
      ok: true;
      sessionToken: string;
      redirectPath: string;
      leadId: string;
    }
  | { ok: false; reason: string; code?: string };

export async function activateAcquisitionTrial(
  input: ActivateAcquisitionTrialInput,
): Promise<ActivateAcquisitionTrialResult> {
  return prepareAcquisitionTrialActivation({
    acquisitionLeadId: input.acquisitionLeadId,
    usersCount: input.usersCount,
    correlationId: input.correlationId,
    grantExtraTrial: input.grantExtraTrial,
    avatarDataUrl: input.avatarDataUrl,
    avatarUrl: input.avatarUrl,
  });
}
