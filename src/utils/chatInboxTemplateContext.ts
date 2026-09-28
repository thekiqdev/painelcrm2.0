import type { ChatConversation } from '@/services/chat';
import type { MessageTemplateContext } from '@/utils/renderMessageTemplate';

type UserLike = {
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
} | null;

type ProfileLike = { company_name?: string } | null;

function contactLabel(conv: ChatConversation | null): string {
  if (!conv) return '';
  const d =
    (conv.displayName ?? conv.display_name ?? conv.contactName ?? conv.profileName ?? conv.phoneNumber ?? '')
      .toString()
      .trim();
  return d;
}

/**
 * Contexto de placeholders para pré-visualização de modelos WhatsApp no inbox (/chat).
 * O envio real usa contexto montado no backend (`buildChatManualTemplateContext`).
 */
export function buildChatInboxTemplateContext(args: {
  conversation: ChatConversation | null;
  user: UserLike;
  profile?: ProfileLike;
}): MessageTemplateContext {
  const contact = contactLabel(args.conversation);
  const company = (args.user?.company_name || args.profile?.company_name || '').trim();
  const operator =
    [args.user?.first_name, args.user?.last_name].filter(Boolean).join(' ').trim() ||
    args.user?.email?.trim() ||
    '';
  const team = (args.conversation?.assigned_team_name ?? '').trim();

  const ctx: MessageTemplateContext = {
    contact_name: contact,
    company_name: company,
    operator_name: operator,
    column_name: '',
    board_name: '',
  };
  if (team) ctx.team_name = team;
  return ctx;
}
