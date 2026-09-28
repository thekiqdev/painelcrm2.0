import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import {
  executeSuperadminTrialExpiration,
  type TrialExpirationResult,
} from '@/services/superadminTrialExpiration';
import { Clock, Loader2, Play } from 'lucide-react';

function formatResultMessage(result: TrialExpirationResult): { title: string; body: string } {
  if (result.suspended === 0) {
    return {
      title: 'Nenhum trial elegível encontrado',
      body: 'Não há tenants em trial ou payment_pending com trial_ends_at vencido e sem faturação ativada.',
    };
  }
  return {
    title: 'Expiração concluída',
    body: [
      `Trials suspensos: ${result.suspended}`,
      `Eventos lifecycle gerados: ${result.lifecycle_events}`,
      `Promoções executadas: ${result.promotions_executed}`,
    ].join('\n'),
  };
}

export function SuperAdminTrialExpirationPanel() {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<TrialExpirationResult | null>(null);

  async function handleExecute() {
    setLoading(true);
    try {
      const res = await executeSuperadminTrialExpiration();
      setLastResult(res.result);
      const msg = formatResultMessage(res.result);
      toast.success(msg.title, { description: msg.body.replace(/\n/g, ' · ') });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Falha ao executar expiração de trials';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const display = lastResult ? formatResultMessage(lastResult) : null;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-crm-primary">
            <Clock className="h-5 w-5" aria-hidden />
          </span>
          <div className="space-y-1">
            <CardTitle className="text-lg">Expiração de trials</CardTitle>
            <CardDescription>
              Executa <code className="text-xs">expireTrialsPastDue()</code> — a mesma rotina do scheduler
              automático (a cada 1h e na subida da API). Suspende trials vencidos e promove cards para
              Reativação / Trial expirado.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" onClick={() => void handleExecute()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Executar expiração de trials
        </Button>

        {display ? (
          <Alert>
            <AlertTitle>{display.title}</AlertTitle>
            <AlertDescription className="whitespace-pre-line">{display.body}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
