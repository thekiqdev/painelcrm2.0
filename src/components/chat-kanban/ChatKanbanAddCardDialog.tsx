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
import { useKanbanService } from '@/components/chat-kanban/KanbanServiceContext';
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
  const kanban = useKanbanService();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setDebouncedSearch('');
      setConversations([]);
      setSelectedIds(new Set());
    }
  }, [open]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    if (!boardId || !column || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setCreating(true);
    try {
      let ok = 0;
      const autoProposals: Array<{
        id: string;
        title?: string | null;
        public_link_path?: string | null;
      }> = [];
      const errors: string[] = [];

      for (const conversationId of ids) {
        try {
          const created = await kanban.createCard(boardId, {
            conversation_id: conversationId,
            column_id: column.id,
          });
          ok += 1;
          const auto = created.kanban_auto_created_proposal;
          if (auto?.id) {
            if (auto.public_link_path?.trim()) {
              setStoredProposalPublicUrl(auto.id, `${window.location.origin}${auto.public_link_path.trim()}`);
            }
            autoProposals.push({
              id: auto.id,
              title: auto.title,
              public_link_path: auto.public_link_path ?? null,
            });
          }
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'Erro desconhecido');
        }
      }

      if (ok > 0) {
        toast.success(
          ok === 1 ? 'Conversa adicionada ao quadro' : `${ok} conversas adicionadas ao quadro`,
        );
      }
      if (autoProposals.length === 1) {
        const auto = autoProposals[0];
        toast.success('Proposta criada automaticamente', {
          description: auto.title ?? undefined,
          action: auto.public_link_path
            ? {
                label: 'Abrir link',
                onClick: () =>
                  window.open(
                    `${window.location.origin}${auto.public_link_path!.trim()}`,
                    '_blank',
                    'noopener,noreferrer',
                  ),
              }
            : undefined,
        });
      } else if (autoProposals.length > 1) {
        toast.success(`${autoProposals.length} propostas criadas automaticamente`, {
          description: 'Abra o quadro ou as propostas para ver os detalhes.',
        });
      }
      if (errors.length > 0) {
        toast.error(
          errors.length === 1
            ? errors[0]
            : `${errors.length} conversas não puderam ser adicionadas`,
          { description: errors.length > 1 ? errors.slice(0, 3).join(' · ') : undefined },
        );
      }

      if (ok > 0) {
        onCreated();
        if (errors.length === 0) {
          onOpenChange(false);
        }
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar conversa</DialogTitle>
          <DialogDescription>
            {column ? (
              <>
                Coluna <span className="font-medium text-foreground">{column.name}</span>. Só aparecem conversas desta empresa
                que ainda não estão neste quadro. Pode selecionar várias de uma vez.
              </>
            ) : (
              'Escolha uma ou mais conversas existentes.'
            )}
          </DialogDescription>
        </DialogHeader>
        <ChatKanbanConversationPicker
          search={search}
          onSearchChange={setSearch}
          conversations={conversations}
          loading={loading}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={selectedIds.size === 0 || creating}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : selectedIds.size <= 1 ? (
              'Adicionar ao quadro'
            ) : (
              `Adicionar ${selectedIds.size} ao quadro`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
