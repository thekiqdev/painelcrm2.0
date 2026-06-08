import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/integrations/api/client';
import { Loader2 } from 'lucide-react';

export default function OnboardingKickoffPlaceholderPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const leadId = params.get('lead') ?? '';
  const [loading, setLoading] = useState(true);
  const [lead, setLead] = useState<{
    current_stage?: string;
    activation_score?: string;
    correlation_id?: string;
  } | null>(null);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }
    apiClient
      .get<{ ok: boolean; lead?: typeof lead }>(`/api/public/acquisition/leads/${leadId}`)
      .then((res) => setLead(res.data?.lead ?? null))
      .catch(() => setLead(null))
      .finally(() => setLoading(false));
  }, [leadId]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Onboarding — kickoff</CardTitle>
          <CardDescription>Placeholder Sprint 6 (sem UI completa ainda)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          ) : (
            <>
              <p className="text-sm">Lead: {leadId || '—'}</p>
              <p className="text-sm">Estágio: {lead?.current_stage ?? '—'}</p>
              <p className="text-sm">Activation score: {lead?.activation_score ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Correlation: {lead?.correlation_id ?? '—'}</p>
              <Button className="w-full" onClick={() => navigate('/onboarding')}>
                Ir para onboarding atual
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard')}>
                Ir para dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
