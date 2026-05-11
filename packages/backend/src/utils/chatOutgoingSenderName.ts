/**
 * Prefixo *Nome* em mensagens de texto enviadas manualmente (WhatsApp),
 * quando o utilizador tem chat_show_sender_name ativo.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type ChatSenderNamePrefixResult = {
  textToSend: string;
  meta: Record<string, unknown>;
};

export function buildManualOutgoingTextWithSenderPrefix(params: {
  rawBody: string;
  senderDisplayName: string;
  chatShowSenderName: boolean;
}): ChatSenderNamePrefixResult {
  const raw = (params.rawBody ?? '').trim();
  const name = (params.senderDisplayName ?? '').trim();
  if (!params.chatShowSenderName || !raw || !name) {
    return { textToSend: raw, meta: {} };
  }
  const prefix = `*${name}*`;
  const dup = new RegExp(`^\\*${escapeRegExp(name)}\\*\\s*(\\n\\n|\\n)`, 'm');
  if (dup.test(raw)) {
    return {
      textToSend: raw,
      meta: { sender_name_prefix_skipped: true, reason: 'already_prefixed' },
    };
  }
  const textToSend = `${prefix}\n\n${raw}`;
  return {
    textToSend,
    meta: {
      sender_name_prefix_applied: true,
      original_body: raw,
      sent_body: textToSend,
      sender_display_name: name,
    },
  };
}
