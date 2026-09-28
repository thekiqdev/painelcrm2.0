import type { ChatKanbanBoardCard } from '@/services/chatKanban';
import { kanbanCardTitle } from '@/utils/chatKanbanCardDisplay';
import type { MessageTemplateContext } from '@/utils/renderMessageTemplate';

type UserLike = {
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
} | null;

type ProfileLike = { company_name?: string } | null;

/**
 * Contexto para `renderMessageTemplate` no drawer do Kanban (dados já disponíveis no cliente).
 */
export function buildKanbanDrawerTemplateContext(args: {
  card: ChatKanbanBoardCard | null;
  user: UserLike;
  profile: ProfileLike;
  boardName?: string | null;
  columnName?: string | null;
}): MessageTemplateContext {
  const contact = args.card ? kanbanCardTitle(args.card) : '';
  const company = (args.user?.company_name || args.profile?.company_name || '').trim();
  const operator =
    [args.user?.first_name, args.user?.last_name].filter(Boolean).join(' ').trim() ||
    args.user?.email?.trim() ||
    '';

  const ctx: MessageTemplateContext = {
    contact_name: contact,
    company_name: company,
    operator_name: operator,
  };

  if (args.boardName?.trim()) ctx.board_name = args.boardName.trim();
  if (args.columnName?.trim()) ctx.column_name = args.columnName.trim();

  return ctx;
}
