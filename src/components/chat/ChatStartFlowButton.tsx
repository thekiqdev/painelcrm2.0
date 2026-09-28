import * as React from 'react';
import { Bot } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useAuth } from '@/contexts/AuthContext';
import {
  listChatbotFlows,
  startChatbotFlowSession,
  type ChatbotFlow,
} from '@/services/chatbotFlows';
import { cn } from '@/lib/utils';

type Props = {
  conversationId: string | null;
  attendanceInProgress?: boolean;
  className?: string;
  iconOnly?: boolean;
};

/**
 * S23 — botão + diálogo para iniciar flow publicado na conversa aberta.
 */
export function ChatStartFlowButton({
  conversationId,
  attendanceInProgress,
  className,
  iconOnly,
}: Props) {
  const runtimeOn = useFeatureFlag('chatbot_flows_runtime');
  const editorOn = useFeatureFlag('chatbot_flows');
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [flows, setFlows] = React.useState<ChatbotFlow[]>([]);
  const [flowId, setFlowId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [starting, setStarting] = React.useState(false);

  const canForce =
    user?.is_tenant_admin === true || user?.is_super_admin === true;

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void listChatbotFlows()
      .then((all) => {
        if (cancelled) return;
        const active = all.filter(
          (f) => f.status === 'active' && f.published_version_id
        );
        setFlows(active);
        setFlowId(active[0]?.id ?? '');
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Falha ao listar flows');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!runtimeOn || !editorOn || !conversationId) return null;

  const onStart = async (force?: boolean) => {
    if (!conversationId || !flowId) {
      toast.error('Selecione um flow publicado');
      return;
    }
    setStarting(true);
    try {
      await startChatbotFlowSession({
        conversation_id: conversationId,
        flow_id: flowId,
        force: force === true,
      });
      toast.success('Flow iniciado — mensagens enviadas pelo WhatsApp');
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao iniciar flow';
      if (msg.includes('atendimento_humano') && canForce) {
        toast.error('Conversa em atendimento. Use “Forçar início” se necessário.');
      } else {
        toast.error(msg);
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'h-7 gap-0.5 px-2 text-[11px] md:h-8 md:gap-1 md:px-3 md:text-sm',
          iconOnly && 'h-7 w-7 px-0',
          className
        )}
        onClick={() => setOpen(true)}
        title="Iniciar chatbot flow"
      >
        <Bot className="h-3.5 w-3.5" />
        {!iconOnly ? <span>Flow</span> : <span className="sr-only">Iniciar flow</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar flow</DialogTitle>
            <DialogDescription>
              Dispara o flow publicado nesta conversa (envio real no WhatsApp).
              {attendanceInProgress
                ? ' Atenção: há atendimento humano em andamento.'
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Flow</Label>
            <Select
              value={flowId || undefined}
              onValueChange={setFlowId}
              disabled={loading || flows.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={loading ? 'A carregar…' : 'Selecione um flow'}
                />
              </SelectTrigger>
              <SelectContent>
                {flows.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {flows.length === 0 && !loading ? (
              <p className="text-xs text-muted-foreground">
                Nenhum flow ativo com versão publicada.
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {attendanceInProgress && canForce ? (
              <Button
                type="button"
                variant="destructive"
                disabled={starting || !flowId}
                onClick={() => void onStart(true)}
              >
                Forçar início
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={
                starting ||
                !flowId ||
                (attendanceInProgress && !canForce)
              }
              onClick={() => void onStart(false)}
            >
              {starting ? 'A iniciar…' : 'Iniciar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
