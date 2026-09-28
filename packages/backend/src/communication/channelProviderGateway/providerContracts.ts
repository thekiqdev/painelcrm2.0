import type {
  CommunicationChannel,
  CommunicationMessageIntent,
  CommunicationProviderKey,
  ProviderCapability,
  ProviderHealth,
  SendCommunicationInput,
} from '../communicationTypes.js';

export type ProviderSendResult = {
  ok: boolean;
  externalMessageId?: string | null;
  error?: string;
  accepted?: boolean;
};

export type ProviderTemplateSendInput = SendCommunicationInput & {
  templateKey: string;
  templateVariables: Record<string, string>;
};

export type ProviderWebhookNormalizeInput = {
  rawPayload: unknown;
  headers?: Record<string, string>;
  tenantId?: string | null;
};

export type ICommunicationProviderAdapter = {
  readonly providerKey: CommunicationProviderKey;
  readonly displayName: string;

  supportsChannel(channel: CommunicationChannel): boolean;
  getCapabilities(): ProviderCapability[];

  healthCheck(): Promise<ProviderHealth>;

  sendMessage(input: SendCommunicationInput): Promise<ProviderSendResult>;
  sendTemplate?(input: ProviderTemplateSendInput): Promise<ProviderSendResult>;
  sendTransactionalMessage?(input: SendCommunicationInput): Promise<ProviderSendResult>;

  normalizeWebhook?(input: ProviderWebhookNormalizeInput): import('../communicationTypes.js').NormalizedWebhookEvent[];
};

export function intentRequiresCapability(intent: CommunicationMessageIntent): ProviderCapability[] {
  if (intent === 'marketing') return ['marketing_allowed'];
  if (intent === 'transactional' || intent === 'billing' || intent === 'onboarding' || intent === 'recovery') {
    return ['transactional_allowed'];
  }
  return [];
}
