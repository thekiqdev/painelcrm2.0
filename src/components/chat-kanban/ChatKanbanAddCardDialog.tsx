import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { chatService, type ChatConversation } from '@/services/chat';
import { chatKanbanService } from '@/services/chatKanban';
import { setStoredProposalPublicUrl } from '@/utils/proposalPublicLinkSession';
import type { ChatKanbanColumn } from '@/services/chatKanban';
import { ChatKanbanConversationPicker } from '@/components/chat-kanban/ChatKanbanConversationPicker';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string | null;
  column: ChatKanbanColumn | null;
  /** IDs de conversa que já têm card neste board — excluídas da lista. */
  excludedConversationIds: readonly string[];
  onCreated: () => void;
};

export function ChatKanbanAddCardDialog({
  open,
  onOpenChange,
  boardId,
  column,
  excludedConversationIds,
  onCreated,
}: Props) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setDebouncedSearch('');
      setConversations([]);
      setSelectedId(null);
    }
  }, [open]);

  const loadList = useCallback(async () => {
    if (!open || !boardId || !column) return;
    setLoading(true);
    try {
      const list = await chatService.getConversations({
        inboxScope: 'tenant',
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const excluded = new Set(excludedConversationIds);
      const filtered = list.filter((c) => !excluded.has(c.id));
      setConversations(filtered);
    } catch (e) {
      console.error('[KanbanAddCard] loadList', e);
      toast.error('Não foi possível carregar conversas', {
        description: e instanceof Error ? e.message : undefined,
      });
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [open, boardId, column, debouncedSearch, excludedConversationIds]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleConfirm = async () => {
    if (!boardId || !column || !selectedId) return;
    setCreating(true);
    try {
      const created = await chatKanbanService.createCard(boardId, {
        conversation_id: selectedId,
        column_id: column.id,
      });
      const auto = created.kanban_auto_created_proposal;
      if (auto) {
        if (auto.public_link_path?.trim()) {
          setStoredProposalPublicUrl(auto.id, `${window.location.origin}${auto.public_link_path.trim()}`);
        }
        toast.success('Conversa adicionada ao quadro', {
          description: `Proposta criada: ${auto.title}`,
        });
      } else {
        toast.success('Conversa adicionada ao quadro');
      }
      onCreated();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao criar card';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar conversa</DialogTitle>
          <DialogDescription>
            {column ? (
              <>
                Coluna <span className="font-medium text-foreground">{column.name}</span>. Só aparecem conversas desta empresa
                que ainda não estão neste quadro.
              </>
            ) : (
              'Escolha uma conversa existente.'
            )}
          </DialogDescription>
        </DialogHeader>
        <ChatKanbanConversationPicker
          search={search}
          onSearchChange={setSearch}
          conversations={conversations}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={!selectedId || creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar ao quadro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
