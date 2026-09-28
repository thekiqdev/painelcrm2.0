import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, MessageCircle, Plus, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TicketCategory, TicketPriority } from '@/types/tickets';
import { ticketPriorityLabels } from '@/types/tickets';

const CREATE_CATEGORY_VALUE = '__create_ticket_category__';

export type ChatTicketDraft = {
  subject: string;
  description: string;
  categoryId: string;
  priority: TicketPriority;
};

type ChatCreateTicketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TicketCategory[];
  submitting: boolean;
  contactName: string;
  phone?: string | null;
  email?: string | null;
  clientName?: string | null;
  leadName?: string | null;
  conversationId?: string | null;
  initialDescription: string;
  onCreateCategory?: (name: string) => Promise<TicketCategory>;
  onSubmit: (draft: ChatTicketDraft) => void | Promise<void>;
};

export function ChatCreateTicketDialog({
  open,
  onOpenChange,
  categories,
  submitting,
  contactName,
  phone,
  email,
  clientName,
  leadName,
  conversationId,
  initialDescription,
  onCreateCategory,
  onSubmit,
}: ChatCreateTicketDialogProps) {
  const defaultCategoryId = categories[0]?.id ?? '';
  const [draft, setDraft] = useState<ChatTicketDraft>({
    subject: 'Atendimento via WhatsApp',
    description: initialDescription,
    categoryId: defaultCategoryId,
    priority: 'normal',
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryCreateMode, setCategoryCreateMode] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({
      subject: 'Atendimento via WhatsApp',
      description: initialDescription,
      categoryId: defaultCategoryId,
      priority: 'normal',
    });
    setNewCategoryName('');
    setCategoryCreateMode(false);
  }, [open, initialDescription, defaultCategoryId]);

  const linkedLabel = useMemo(() => {
    if (clientName) return `Cliente: ${clientName}`;
    if (leadName) return `Lead: ${leadName}`;
    return 'Contato sem vínculo CRM';
  }, [clientName, leadName]);

  const canSubmit = draft.subject.trim() && draft.description.trim() && draft.categoryId && !submitting;

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || !onCreateCategory) return;
    setCreatingCategory(true);
    try {
      const created = await onCreateCategory(trimmed);
      setDraft((prev) => ({ ...prev, categoryId: created.id }));
      setNewCategoryName('');
      setCategoryCreateMode(false);
    } finally {
      setCreatingCategory(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-[680px]">
        <DialogHeader className="border-b bg-muted/25 px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Ticket className="h-4 w-4" />
            </span>
            Abrir ticket pelo chat
          </DialogTitle>
          <DialogDescription>
            Crie um chamado sem sair da conversa. Os dados do atendimento serão anexados ao ticket.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            void onSubmit(draft);
          }}
        >
          <div className="max-h-[calc(92dvh-9.5rem)] space-y-5 overflow-y-auto px-5 py-4">
            <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp/chat
                </Badge>
                <Badge variant="outline">{linkedLabel}</Badge>
                {conversationId ? <Badge variant="outline">Conversa vinculada</Badge> : null}
              </div>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <p className="truncate">
                  <span className="font-medium text-foreground">Contato:</span> {contactName || 'Contato WhatsApp'}
                </p>
                <p className="truncate">
                  <span className="font-medium text-foreground">Telefone:</span> {phone || 'Não informado'}
                </p>
                <p className="truncate">
                  <span className="font-medium text-foreground">E-mail:</span> {email || 'Não informado'}
                </p>
              </div>
            </section>

            <div className="space-y-2">
              <Label htmlFor="chat-ticket-subject">Assunto *</Label>
              <Input
                id="chat-ticket-subject"
                value={draft.subject}
                onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))}
                placeholder="Ex.: Atendimento via WhatsApp"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="chat-ticket-category">Categoria *</Label>
                <Select
                  value={draft.categoryId}
                  onValueChange={(value) => {
                    if (value === CREATE_CATEGORY_VALUE) {
                      setCategoryCreateMode(true);
                      return;
                    }
                    setDraft((prev) => ({ ...prev, categoryId: value }));
                  }}
                  required
                >
                  <SelectTrigger id="chat-ticket-category">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                    {onCreateCategory ? (
                      <SelectItem value={CREATE_CATEGORY_VALUE} className="mt-1 border-t pt-2 text-primary">
                        <span className="flex items-center gap-2 font-medium">
                          <Plus className="h-4 w-4" />
                          Adicionar +
                        </span>
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
                {categories.length === 0 ? (
                  <p className="text-xs text-destructive">Cadastre uma categoria de ticket antes de criar chamados.</p>
                ) : null}
                {onCreateCategory && categoryCreateMode ? (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      placeholder="Nova categoria"
                      disabled={creatingCategory}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={handleCreateCategory}
                      disabled={!newCategoryName.trim() || creatingCategory}
                      title="Criar categoria"
                    >
                      {creatingCategory ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      Criar
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="chat-ticket-priority">Prioridade *</Label>
                <Select
                  value={draft.priority}
                  onValueChange={(value) => setDraft((prev) => ({ ...prev, priority: value as TicketPriority }))}
                  required
                >
                  <SelectTrigger id="chat-ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ticketPriorityLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chat-ticket-description">Descrição *</Label>
              <Textarea
                id="chat-ticket-description"
                value={draft.description}
                onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                rows={8}
                className="resize-none"
                placeholder="Resumo do atendimento, problema relatado e próximos passos..."
                required
              />
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/20 px-5 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Criar ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
