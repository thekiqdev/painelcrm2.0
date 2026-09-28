import type { CommunicationProvider } from './communicationTypes.js';
import type {
  NormalizedCommunicationContact,
  NormalizedCommunicationConversation,
  NormalizedCommunicationMessage,
} from './normalizedCommunication.js';

/** Parâmetros genéricos para envio (adaptadores especializam). */
export type SendProviderMessageParams = {
  channelId: string;
  tenantId: string | null;
  actorUserId: string;
  conversationId: string;
  body?: string | null;
  mediaUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type SyncConversationsParams = {
  channelId: string;
  actorUserId: string;
  tenantId: string | null;
  limit?: number;
  sinceTimestampMs?: number | null;
};

export type SyncConversationHistoryParams = {
  channelId: string;
  actorUserId: string;
  conversationId: string;
  tenantId: string | null;
  mode?: string;
};

export type RefreshProfileParams = {
  channelId: string;
  actorUserId: string;
  tenantId: string | null;
  providerConversationId?: string | null;
};

/**
 * Contrato por provedor. Implementações encapsulam payloads crus (ex.: Uazapi).
 * Na Fase 4, a maior parte do fluxo WhatsApp ainda passa pelo chatController;
 * estes métodos servem como fronteira para novos fluxos e testes.
 */
export interface CommunicationProviderAdapter {
  readonly provider: CommunicationProvider;

  normalizeWebhookEvent(payload: unknown): { eventHint: string; payload: unknown };

  normalizeConversation(raw: unknown): NormalizedCommunicationConversation | null;

  normalizeMessage(raw: unknown): NormalizedCommunicationMessage | null;

  normalizeContact(raw: unknown): NormalizedCommunicationContact | null;

  sendMessage(params: SendProviderMessageParams): Promise<{ ok: boolean; error?: string }>;

  syncConversations(params: SyncConversationsParams): Promise<{ ok: boolean; error?: string }>;

  syncConversationHistory(params: SyncConversationHistoryParams): Promise<{ ok: boolean; error?: string }>;

  refreshProfile(params: RefreshProfileParams): Promise<{ ok: boolean; error?: string }>;
}
