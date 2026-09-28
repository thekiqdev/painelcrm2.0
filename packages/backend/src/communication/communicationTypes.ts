export type CommunicationChannel = 'whatsapp' | 'email' | 'sms' | 'internal' | 'push';

export type CommunicationProviderKey = 'uazapi' | 'smtp' | 'meta_cloud' | 'internal';

export type CommunicationMessageIntent =
  | 'onboarding'
  | 'recovery'
  | 'billing'
  | 'support'
  | 'crm'
  | 'marketing'
  | 'ai'
  | 'transactional';

export type CommunicationDeliveryState =
  | 'queued'
  | 'accepted'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'dead_letter';

export type ProviderCapability =
  | 'template_support'
  | 'media_support'
  | 'typing_support'
  | 'read_receipt'
  | 'reactions'
  | 'session_window'
  | 'official_api'
  | 'transactional_allowed'
  | 'marketing_allowed';

export type SendCommunicationInput = {
  tenantId?: string | null;
  channel: CommunicationChannel;
  messageIntent: CommunicationMessageIntent;
  recipient: string;
  body?: string;
  templateKey?: string;
  templateVariables?: Record<string, string>;
  correlationId?: string;
  idempotencyKey: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  /** Bridge: tenant CRM WhatsApp via sender user instance */
  senderUserId?: string;
  /** Bridge: platform WhatsApp instance token */
  instanceToken?: string;
};

export type CommunicationDispatchResult = {
  outcome: 'skipped' | 'shadow_logged' | 'queued' | 'sent' | 'failed';
  communicationMessageId?: string;
  provider?: CommunicationProviderKey;
  externalMessageId?: string | null;
  fallbackUsed?: boolean;
  shadow?: boolean;
  error?: string;
  reason?: string;
};

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

export type ProviderHealth = {
  provider: CommunicationProviderKey;
  status: ProviderHealthStatus;
  checkedAt: string;
  details?: Record<string, unknown>;
};

export type RoutingDecision = {
  primaryProvider: CommunicationProviderKey;
  fallbackProvider?: CommunicationProviderKey;
  reason: string;
  tenantId?: string | null;
  channel: CommunicationChannel;
  intent: CommunicationMessageIntent;
};

export type NormalizedWebhookEventType =
  | 'communication.message.received'
  | 'communication.message.sent'
  | 'communication.message.delivered'
  | 'communication.message.read'
  | 'communication.message.failed';

export type NormalizedWebhookEvent = {
  eventType: NormalizedWebhookEventType;
  provider: CommunicationProviderKey;
  channel: CommunicationChannel;
  externalMessageId?: string;
  recipient?: string;
  tenantId?: string | null;
  correlationId?: string;
  occurredAt: string;
  rawProvider: string;
  payload: Record<string, unknown>;
};

export type StartConversationInput = {
  tenantId?: string | null;
  channel: CommunicationChannel;
  messageIntent: CommunicationMessageIntent;
  recipient: string;
  correlationId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type StartConversationResult = {
  outcome: 'skipped' | 'shadow_logged' | 'started';
  conversationId?: string;
  shadow?: boolean;
};
