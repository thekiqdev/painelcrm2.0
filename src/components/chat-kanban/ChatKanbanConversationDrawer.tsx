import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Layers, LayoutTemplate, Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatBubbleContent } from '@/components/chat/ChatBubbleContent';
import { MessageStatusIndicator } from '@/components/chat/MessageStatusIndicator';
import { ChatKanbanTemplatePickerDialog } from '@/components/chat-kanban/ChatKanbanTemplatePickerDialog';
import { ChatWhatsappModelPickerDialog } from '@/components/chat/ChatWhatsappModelPickerDialog';
import { chatService, type ChatMessage } from '@/services/chat';
import type { ChatKanbanBoardCard } from '@/services/chatKanban';
import { kanbanCardPhoneLine, kanbanCardTitle } from '@/utils/chatKanbanCardDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { buildKanbanDrawerTemplateContext } from '@/utils/kanbanDrawerTemplateContext';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';

const formatHour = (value?: string | null) => {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: ChatKanbanBoardCard | null;
  /** Nome do quadro (opcional, para placeholders `board_name`). */
  boardName?: string | null;
  /** Nome da coluna do cartão (opcional, para `column_name`). */
  columnName?: string | null;
  /** Coluna com criação automática de proposta ao mover o cartão. */
  columnAutoCreatesProposal?: boolean;
  /** Atualizar board (ex.: preview) após envio */
  onAfterSend?: () => void;
};

export function ChatKanbanConversationDrawer({
  open,
  onOpenChange,
  card,
  boardName,
  columnName,
  columnAutoCreatesProposal = false,
  onAfterSend,
}: Props) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [whatsappModelPickerOpen, setWhatsappModelPickerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  const conversationId = card?.conversation_id ?? null;

  const hasCrmLink = Boolean(card?.conv_client_id || card?.conv_lead_id);

  const templateContext = useMemo(
    () =>
      buildKanbanDrawerTemplateContext({
        card,
        user,
        profile,
        boardName,
        columnName,
      }),
    [card, user, profile, boardName, columnName],
  );

  const loadThread = useCallback(async (cid: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      await chatService.syncConversationMessages(cid, { limit: 100, syncMode: 'full' });
      if (activeConversationIdRef.current !== cid) return;
      const data = await chatService.getConversationMessages(cid);
      if (activeConversationIdRef.current !== cid) return;
      setMessages(data);
    } catch (e) {
      console.error('[KanbanDrawer] loadThread', e);
      if (!silent) {
        toast.error('Erro ao carregar mensagens', {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeConversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!open || !conversationId) {
      setMessages([]);
      setNewMessage('');
      return;
    }
    setMessages([]);
    void chatService.markConversationRead(conversationId).catch(() => {});
    void loadThread(conversationId);
  }, [open, conversationId, loadThread]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conversationId || !newMessage.trim()) return;
    const text = newMessage.trim();
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    setNewMessage('');
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversation_id: conversationId,
      direction: 'outgoing',
      body: text,
      status: 'queued',
      sentAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      setSending(true);
      await chatService.sendMessage(conversationId, text);
      await loadThread(conversationId, { silent: true });
      onAfterSend?.();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setNewMessage(text);
      toast.error('Não foi possível enviar', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSending(false);
    }
  };

  const handleImageChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !conversationId) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem');
      return;
    }
    const caption = newMessage.trim();
    setNewMessage('');
    try {
      setSending(true);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('Falha ao ler arquivo'));
        r.readAsDataURL(file);
      });
      const comma = dataUrl.indexOf(',');
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      await chatService.sendImageMessage(conversationId, {
        fileBase64: base64,
        mimeType: file.type || 'image/jpeg',
        ...(caption ? { caption } : {}),
      });
      await loadThread(conversationId, { silent: true });
      onAfterSend?.();
    } catch (err) {
      setNewMessage(caption);
      toast.error('Falha ao enviar imagem', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSending(false);
    }
  };

  const title = card ? kanbanCardTitle(card) : '';
  const phone = card ? kanbanCardPhoneLine(card) : null;
  const convAvatar = card ? chatAvatarUrlForImgSrc(card.conv_avatar_url) : null;

  return (
    <>
      <ChatKanbanTemplatePickerDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        context={templateContext}
        onApply={(text) => setNewMessage(text)}
      />
      <ChatWhatsappModelPickerDialog
        open={whatsappModelPickerOpen}
        onOpenChange={setWhatsappModelPickerOpen}
        conversationId={conversationId}
        previewContext={templateContext}
        onAfterSend={() => {
          if (conversationId) void loadThread(conversationId, { silent: true });
          onAfterSend?.();
        }}
      />
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex flex-col w-full sm:max-w-xl md:max-w-2xl p-0 gap-0 h-full"
        >
        <SheetHeader className="px-4 py-3 border-b space-y-0 text-left shrink-0 bg-muted/20">
          <div className="flex items-start gap-3 pr-8">
            <Avatar className="h-11 w-11 rounded-lg shrink-0">
              {convAvatar ? (
                <AvatarImage src={convAvatar} alt="" className="object-cover" />
              ) : null}
              <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-semibold">
                {title.slice(0, 2).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold leading-tight truncate">{title}</SheetTitle>
              <SheetDescription className="sr-only">Conversa WhatsApp no contexto do Kanban</SheetDescription>
              {phone ? <p className="text-xs text-muted-foreground tabular-nums truncate mt-0.5">{phone}</p> : null}
              <div className="flex flex-wrap gap-1 mt-2">
                {card?.conv_client_id ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Cliente
                  </Badge>
                ) : null}
                {card?.conv_lead_id && !card?.conv_client_id ? (
                  <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-200">Lead</Badge>
                ) : null}
                {!card?.conv_client_id && !card?.conv_lead_id ? (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Sem vínculo CRM
                  </Badge>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 -mr-1"
              title="Atualizar mensagens"
              disabled={!conversationId || loading}
              onClick={() => conversationId && void loadThread(conversationId)}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {columnAutoCreatesProposal && hasCrmLink ? (
            <div className="px-4 pb-2 shrink-0 rounded-md border border-border/50 bg-muted/15 mx-4 mb-1 py-2">
              <p className="text-[10px] text-muted-foreground leading-snug">
                <span className="font-medium text-foreground">Proposta automática:</span> ao mover o cartão para esta
                coluna, o sistema cria a proposta com o modelo configurado. Use <strong>Propostas</strong> no menu para
                rever ou partilhar o link público.
              </p>
            </div>
          ) : null}
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]]:!block [&_[data-radix-scroll-area-scrollbar]]:w-1.5">
          <div className="p-4">
            {loading && messages.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                A carregar…
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">Nenhuma mensagem nesta conversa.</p>
            ) : (
              <div className="space-y-3 pb-4 max-w-3xl mx-auto">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[min(88%,28rem)] rounded-xl px-3.5 py-2.5 text-sm shadow-sm leading-relaxed ${
                        message.direction === 'outgoing'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/90 border border-border/40'
                      }`}
                    >
                      <ChatBubbleContent message={message} />
                      <span
                        className={`text-[10px] mt-1 flex items-center gap-1 ${
                          message.direction === 'outgoing'
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span>{formatHour(message.sentAt)}</span>
                        {message.direction === 'outgoing' ? (
                          <MessageStatusIndicator status={message.status} className="h-3 w-3" />
                        ) : null}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        <form onSubmit={handleSend} className="border-t p-3 flex gap-2 shrink-0 bg-background">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={sending || !conversationId}
            title="Enviar imagem"
            onClick={() => imageInputRef.current?.click()}
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={sending || !conversationId}
            title="Usar template interno"
            onClick={() => setTemplatePickerOpen(true)}
          >
            <LayoutTemplate className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={sending || !conversationId}
            title="Usar modelo WhatsApp (sequência)"
            onClick={() => setWhatsappModelPickerOpen(true)}
          >
            <Layers className="h-4 w-4" />
          </Button>
          <Input
            placeholder="Mensagem…"
            value={newMessage}
            onChange={(ev) => setNewMessage(ev.target.value)}
            disabled={sending || !conversationId}
          />
          <Button type="submit" size="icon" disabled={sending || !newMessage.trim() || !conversationId}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
    </>
  );
}
