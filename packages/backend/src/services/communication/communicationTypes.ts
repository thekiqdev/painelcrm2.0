/**
 * Tipos centrais do Chat Engine (multicanal).
 * Valores alinhados com persistência e eventos realtime.
 */

export type CommunicationProvider =
  | 'whatsapp_uazapi'
  | 'instagram'
  | 'facebook_messenger'
  | 'webchat'
  | 'email';

/** Direção canónica no modelo normalizado (mapear de/para incoming/outgoing na BD). */
export type CommunicationDirection = 'inbound' | 'outbound';

export type CommunicationMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'template'
  | 'system';

export type CommunicationConversationStatus = 'open' | 'pending' | 'closed' | 'archived';

export const DEFAULT_COMMUNICATION_PROVIDER: CommunicationProvider = 'whatsapp_uazapi';

export function dbDirectionToCanonical(direction: string | null | undefined): CommunicationDirection {
  const d = String(direction || '').toLowerCase();
  if (d === 'outgoing') return 'outbound';
  return 'inbound';
}

export function canonicalDirectionToDb(direction: CommunicationDirection): 'incoming' | 'outgoing' {
  return direction === 'outbound' ? 'outgoing' : 'incoming';
}
