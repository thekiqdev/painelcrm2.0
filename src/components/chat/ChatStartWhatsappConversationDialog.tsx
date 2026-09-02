import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { previewNormalizePhoneBr } from '@/features/chatbot-flows/lib/ensureConversationPhone';
import { chatService, type ChatInstance } from '@/services/chat';

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function ChatStartWhatsappIconButton({
  disabled,
  title = 'Nova conversa WhatsApp',
  className,
  onClick,
}: {
  disabled?: boolean;
  title?: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={onClick}
      className={className}
    >
      <WhatsAppGlyph className="h-[1.15rem] w-[1.15rem] text-emerald-600 dark:text-emerald-400" />
    </Button>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: ChatInstance[];
  defaultInstanceId?: string | null;
  onStarted: (conversationId: string) => void | Promise<void>;
};

export function ChatStartWhatsappConversationDialog({
  open,
  onOpenChange,
  instances,
  defaultInstanceId,
  onStarted,
}: Props) {
  const connected = useMemo(
    () =>
      instances.filter((i) => {
        const st = String(i.status || '').toLowerCase();
        return (st === 'connected' || st === 'open') && i.metadata?.enabled_in_chat !== false;
      }),
    [instances],
  );

  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [contactName, setContactName] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhone('');
    setMessage('');
    setContactName('');
    const fallback =
      (defaultInstanceId && connected.some((i) => i.id === defaultInstanceId)
        ? defaultInstanceId
        : connected[0]?.id) ?? '';
    setInstanceId(fallback);
  }, [open, defaultInstanceId, connected]);

  const phonePreview = previewNormalizePhoneBr(phone, true);

  const handleSubmit = async () => {
    const digits = phonePreview.replace(/\D/g, '');
    if (digits.length < 12) {
      toast.error('Informe um telefone válido com DDD (ex.: 11999998888).');
      return;
    }
    const text = message.trim();
    if (!text) {
      toast.error('Digite a mensagem inicial.');
      return;
    }
    if (!instanceId) {
      toast.error('Selecione uma instância WhatsApp conectada.');
      return;
    }

    setSubmitting(true);
    try {
      const prepared = await chatService.prepareConversationByPhone({
        instance_id: instanceId,
        phone: digits,
        contact_name: contactName.trim() || undefined,
      });
      await chatService.sendMessage(prepared.conversation.id, text);
      toast.success(prepared.reused ? 'Conversa reaberta e mensagem enviada' : 'Conversa iniciada');
      onOpenChange(false);
      await onStarted(prepared.conversation.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível iniciar a conversa');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppGlyph className="h-5 w-5 text-emerald-600" />
            Nova conversa WhatsApp
          </DialogTitle>
          <DialogDescription>
            Informe o número e a primeira mensagem. Se já existir conversa com este contato na instância,
            reutilizamos o thread.
          </DialogDescription>
        </DialogHeader>

        {connected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma instância WhatsApp conectada. Conecte em Configurações → Conexões.
          </p>
        ) : (
          <div className="space-y-4 py-1">
            {connected.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="start-wa-instance">Enviar por</Label>
                <Select value={instanceId} onValueChange={setInstanceId} disabled={submitting}>
                  <SelectTrigger id="start-wa-instance">
                    <SelectValue placeholder="Instância WhatsApp" />
                  </SelectTrigger>
                  <SelectContent>
                    {connected.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="start-wa-phone">Telefone WhatsApp</Label>
              <Input
                id="start-wa-phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 99999-8888"
                value={phone}
                disabled={submitting}
                onChange={(e) => setPhone(e.target.value)}
              />
              {phonePreview ? (
                <p className="text-[11px] text-muted-foreground">Será enviado para {phonePreview}</p>
              ) : phone.trim() ? (
                <p className="text-[11px] text-rose-600">Telefone inválido — inclua DDD.</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="start-wa-name">Nome do contato (opcional)</Label>
              <Input
                id="start-wa-name"
                placeholder="Como aparece na lista"
                value={contactName}
                disabled={submitting}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="start-wa-message">Mensagem inicial</Label>
              <Textarea
                id="start-wa-message"
                rows={3}
                placeholder="Olá! ..."
                value={message}
                disabled={submitting}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={submitting || connected.length === 0}
            onClick={() => void handleSubmit()}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Iniciar conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
