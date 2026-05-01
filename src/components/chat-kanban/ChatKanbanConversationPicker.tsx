import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChatConversation } from '@/services/chat';
import {
  formatKanbanActivity,
  pickerConversationLabel,
  pickerConversationPhoneLine,
} from '@/utils/chatKanbanCardDisplay';
import { beginConversationDragSession, endConversationDragSession } from '@/lib/chatKanbanConversationDrag';
import {
  applyConversationDragPreview,
  conversationDragPreviewFromChatConversation,
} from '@/lib/conversationDragPreview';

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  conversations: ChatConversation[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ChatKanbanConversationPicker({
  search,
  onSearchChange,
  conversations,
  loading,
  selectedId,
  onSelect,
}: Props) {
  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome ou telefone…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <ScrollArea className="h-[min(340px,50vh)] rounded-md border border-border/60 [&_[data-radix-scroll-area-viewport]]:!block">
        <div className="p-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              A buscar conversas…
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10 px-4">Nenhuma conversa encontrada.</p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => {
                const title = pickerConversationLabel({
                  displayName: c.displayName,
                  contactName: c.contactName,
                  profileName: c.profileName,
                  phoneNumber: c.phoneNumber,
                  canonicalPhone: c.canonicalPhone,
                });
                const phone = pickerConversationPhoneLine({
                  phoneNumber: c.phoneNumber,
                  canonicalPhone: c.canonicalPhone,
                });
                const preview = (c.lastMessagePreview || '').trim() || '—';
                const when = formatKanbanActivity(c.lastMessageAt);
                const active = selectedId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      draggable
                      title="Arrastar para uma coluna do quadro"
                      onDragStart={(e) => {
                        beginConversationDragSession(e.dataTransfer, {
                          type: 'conversation',
                          conversationId: c.id,
                          hasClient: Boolean(c.client_id),
                          hasLead: Boolean(c.leadId),
                        });
                        applyConversationDragPreview(
                          e,
                          conversationDragPreviewFromChatConversation(c, c.id),
                        );
                      }}
                      onDragEnd={() => endConversationDragSession()}
                      onClick={() => onSelect(c.id)}
                      className={cn(
                        'w-full text-left rounded-md px-3 py-2.5 text-sm transition-colors border border-transparent cursor-grab active:cursor-grabbing',
                        active
                          ? 'bg-primary/10 border-primary/25 ring-1 ring-primary/20'
                          : 'hover:bg-muted/70',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium truncate">{title}</span>
                        {when ? (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{when}</span>
                        ) : null}
                      </div>
                      {phone ? (
                        <p className="text-xs text-muted-foreground tabular-nums truncate mt-0.5">{phone}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{preview}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.client_id ? (
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                            Cliente
                          </Badge>
                        ) : null}
                        {c.leadId && !c.client_id ? (
                          <Badge className="text-[10px] h-5 px-1.5 bg-blue-100 text-blue-800 border-blue-200">Lead</Badge>
                        ) : null}
                        {!c.client_id && !c.leadId ? (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
                            Sem vínculo
                          </Badge>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
