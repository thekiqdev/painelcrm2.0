import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { SupportHero } from '@/components/platform-support/SupportHero';
import { SupportMobileTicketSheet } from '@/components/platform-support/SupportMobileTicketSheet';
import { SupportPageSkeleton } from '@/components/platform-support/SupportPageSkeleton';
import { SupportTicketForm, type SupportTicketFormValues } from '@/components/platform-support/SupportTicketForm';
import { SupportTicketList } from '@/components/platform-support/SupportTicketList';
import { SupportWhatsappCard } from '@/components/platform-support/SupportWhatsappCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { platformSupportService } from '@/services/platformSupport';
import {
  type PlatformSupportPublicSettings,
  type PlatformSupportTicket,
} from '@/types/platformSupport';
import { cn } from '@/lib/utils';

const defaultFormValues: SupportTicketFormValues = {
  subject: '',
  category: 'question',
  priority: 'medium',
  message: '',
};

function isSupportOnline(settings: PlatformSupportPublicSettings | null) {
  if (!settings?.support_enabled) return false;
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const weekday = day >= 1 && day <= 5;
  const businessHours = hour >= 9 && hour < 18;
  return weekday && businessHours;
}

export default function PlatformSupport() {
  const isMobile = useIsMobile();
  const [settings, setSettings] = useState<PlatformSupportPublicSettings | null>(null);
  const [tickets, setTickets] = useState<PlatformSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formValues, setFormValues] = useState<SupportTicketFormValues>(defaultFormValues);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const online = useMemo(() => isSupportOnline(settings), [settings]);
  const supportOff = settings && !settings.support_enabled;

  const load = async () => {
    setLoading(true);
    try {
      const [pub, list] = await Promise.all([
        platformSupportService.getPublicSettings(),
        platformSupportService.listTickets(),
      ]);
      setSettings(pub);
      setTickets(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar suporte');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const patchForm = (patch: Partial<SupportTicketFormValues>) => {
    setFormValues((prev) => ({ ...prev, ...patch }));
  };

  const resetForm = () => {
    setFormValues(defaultFormValues);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticTicket: PlatformSupportTicket = {
      id: optimisticId,
      tenant_id: '',
      created_by_user_id: '',
      subject: formValues.subject.trim(),
      category: formValues.category,
      priority: formValues.priority,
      status: 'open',
      message: formValues.message.trim(),
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      closed_at: null,
    };

    setTickets((prev) => [optimisticTicket, ...prev]);
    setHighlightId(optimisticId);

    try {
      const created = await platformSupportService.createTicket({
        subject: formValues.subject.trim(),
        category: formValues.category,
        priority: formValues.priority,
        message: formValues.message.trim(),
      });
      toast.success('Chamado enviado');
      resetForm();
      setSheetOpen(false);
      setTickets((prev) => [created, ...prev.filter((ticket) => ticket.id !== optimisticId)]);
      setHighlightId(created.id);
    } catch (err) {
      setTickets((prev) => prev.filter((ticket) => ticket.id !== optimisticId));
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar chamado');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <SupportPageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-10 md:p-8">
      {isMobile ? (
        <header className="sticky top-0 z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                <Link to="/" aria-label="Voltar">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Central de suporte</p>
              </div>
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                online
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  : 'border-border/60 bg-muted/50 text-muted-foreground',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
              {online ? 'Online agora' : 'Fora do horário'}
            </span>
          </div>
        </header>
      ) : (
        <SupportHero online={online} />
      )}

      {supportOff ? (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Suporte indisponível</CardTitle>
            <CardDescription>O atendimento da plataforma está temporariamente desativado.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {isMobile ? (
            <div className="space-y-4">
              <SupportWhatsappCard settings={settings} online={online} />
              <Button type="button" className="h-11 w-full" size="lg" onClick={() => setSheetOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Abrir chamado
              </Button>
              <SupportTicketList tickets={tickets} compact highlightId={highlightId} />
              <SupportMobileTicketSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                values={formValues}
                onChange={patchForm}
                onSubmit={handleSubmit}
                sending={sending}
              />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
              <div className="space-y-6">
                <SupportWhatsappCard settings={settings} online={online} />
                <SupportTicketList tickets={tickets} highlightId={highlightId} />
              </div>
              <SupportTicketForm
                values={formValues}
                onChange={patchForm}
                onSubmit={handleSubmit}
                sending={sending}
              />
            </div>
          )}
        </>
      )}

    </div>
  );
}
