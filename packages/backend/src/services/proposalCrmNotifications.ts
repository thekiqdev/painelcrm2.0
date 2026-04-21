import { createNotification } from './notifications.js';

export async function notifyProposalCrm(params: {
  ownerUserId: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    await createNotification({
      userId: params.ownerUserId,
      type: 'crm_proposal',
      title: params.title.slice(0, 255),
      message: params.message,
      data: { ...params.data, module: 'proposals' },
    });
  } catch (e) {
    console.error('[notifyProposalCrm]', e);
  }
}
