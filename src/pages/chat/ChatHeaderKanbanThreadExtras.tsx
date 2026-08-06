import { Headphones } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatKanbanTagBadge } from '@/components/chat/ChatKanbanTagBadge';
import { ChatKanbanTagQuickPicker } from '@/components/chat/ChatKanbanTagQuickPicker';
import type { ChatConversation, ChatKanbanTagUi } from '@/services/chat';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { assigneeInitials } from '@/utils/chatKanbanCardDisplay';
import {
  attendanceIsInProgress,
  shortOperatorName,
} from './chatPageHelpers';

/** Cabeçalho da thread: pills de tags Kanban, + (lista / criar) e nome do operador. */
export function ChatHeaderKanbanThreadExtras({
  conversation,
  conversationKanbanTags,
  tenantOptions,
  tenantLoading,
  busy,
  showTagPicker,
  onAddTag,
}: {
  conversation: ChatConversation;
  conversationKanbanTags: ChatKanbanTagUi[];
  tenantOptions: ChatKanbanTagUi[];
  tenantLoading: boolean;
  busy: boolean;
  showTagPicker: boolean;
  onAddTag: (opts: { tagId?: string; newLabel?: string; newColor?: string }) => Promise<void>;
}) {
  const hasTags = conversationKanbanTags.length > 0;
  const assigneeLabel =
    conversation.assignee_display?.trim() ||
    (conversation.assigned_to_user_id ? 'Atendente' : '');
  const showAssignee =
    attendanceIsInProgress(conversation.attendance_status) && Boolean(assigneeLabel);

  if (!hasTags && !showAssignee && !showTagPicker) return null;

  return (
    <span
      className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {hasTags || showTagPicker || showAssignee ? (
        <span className="shrink-0 text-[10px] text-muted-foreground" aria-hidden>
          |
        </span>
      ) : null}
      {hasTags ? (
        <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1">
          {conversationKanbanTags.map((tag) => (
            <ChatKanbanTagBadge
              key={tag.id}
              label={tag.label}
              color={tag.color}
              className="h-4 max-w-[min(120px,28vw)]"
            />
          ))}
        </span>
      ) : null}
      {showTagPicker ? (
        <ChatKanbanTagQuickPicker
          tenantOptions={tenantOptions}
          tenantLoading={tenantLoading}
          busy={busy}
          conversationKanbanTags={conversationKanbanTags}
          onAddTag={onAddTag}
        />
      ) : null}
      {showAssignee ? (
        <>
          {hasTags || showTagPicker ? (
            <span className="shrink-0 text-[10px] text-muted-foreground" aria-hidden>
              |
            </span>
          ) : null}
          <span
            className="inline-flex min-w-0 max-w-[min(220px,50vw)] items-center gap-1"
            title={assigneeLabel || undefined}
          >
            <Headphones className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden />
            <Avatar className="h-4 w-4 shrink-0 border border-border/60">
              {chatAvatarUrlForImgSrc(conversation.assignee_avatar_url) ? (
                <AvatarImage
                  src={chatAvatarUrlForImgSrc(conversation.assignee_avatar_url)!}
                  alt=""
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback className="bg-primary/15 text-[7px] font-semibold text-primary">
                {assigneeInitials(assigneeLabel)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate text-[10px] font-medium text-foreground">
              {shortOperatorName(assigneeLabel)}
            </span>
          </span>
        </>
      ) : null}
    </span>
  );
}
