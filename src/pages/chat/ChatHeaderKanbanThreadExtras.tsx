import { ChatKanbanTagBadge } from '@/components/chat/ChatKanbanTagBadge';
import { ChatKanbanTagQuickPicker } from '@/components/chat/ChatKanbanTagQuickPicker';
import { ChatAssigneePresence } from '@/components/chat/ChatAssigneePresence';
import type { ChatConversation, ChatKanbanTagUi } from '@/services/chat';
import {
  attendanceIsInProgress,
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
          <ChatAssigneePresence
            displayName={assigneeLabel}
            avatarUrl={conversation.assignee_avatar_url}
            size="md"
            className="max-w-[min(220px,50vw)]"
          />
        </>
      ) : null}
    </span>
  );
}
