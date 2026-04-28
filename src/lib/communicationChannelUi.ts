import {
  type CommunicationProvider,
  DEFAULT_COMMUNICATION_PROVIDER,
} from '@/types/communication';

/** Rótulo curto para badge na lista de conversas (futuros canais). */
export function communicationProviderBadgeLabel(
  provider: CommunicationProvider | string | null | undefined
): string {
  const p = (provider || DEFAULT_COMMUNICATION_PROVIDER) as CommunicationProvider;
  switch (p) {
    case 'whatsapp_uazapi':
      return 'WhatsApp';
    case 'instagram':
      return 'Instagram';
    case 'facebook_messenger':
      return 'Messenger';
    case 'webchat':
      return 'Web';
    case 'email':
      return 'E-mail';
    default:
      return 'Canal';
  }
}

export function shouldShowCommunicationChannelBadge(
  provider: CommunicationProvider | string | null | undefined
): boolean {
  const p = provider || DEFAULT_COMMUNICATION_PROVIDER;
  return p !== DEFAULT_COMMUNICATION_PROVIDER;
}
