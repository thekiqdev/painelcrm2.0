import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';

type AcquisitionConfig = {
  trial_flow_v1?: boolean;
};

export default function TesteGratisPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState<AcquisitionConfig | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    apiClient
      .get<{ ok: boolean; flags: AcquisitionConfig }>('/api/public/acquisition/config')
      .then((res) => {
        if (res.error || !res.data?.ok) {
          setFlags({});
          return;
        }
        setFlags(res.data.flags ?? {});
      })
      .catch(() => setFlags({}));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient.post<{
        ok: boolean;
        code?: string;
        checkout_path?: string;
        fallback_path?: string;
        lead_id?: string;
        correlation_id?: string;
      }>('/api/public/acquisition/teste-gratis', form);

      const body = res.data;
      if (res.error || !body?.ok) {
        toast.error('Fluxo indisponível. Redirecionando para checkout padrão.');
        navigate(body?.fallback_path ?? '/checkout');
        return;
      }

      toast.success('Trial iniciado! Continue no checkout.');
      navigate(body.checkout_path ?? `/onboarding/kickoff?lead=${body.lead_id ?? ''}`);
    } catch {
      toast.error('Erro ao iniciar teste grátis.');
    } finally {
      setLoading(false);
    }
  }

  if (flags === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (flags.trial_flow_v1 === false) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Teste grátis</CardTitle>
            <CardDescription>
              O novo fluxo ainda não está ativo. Use o checkout padrão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/checkout')}>
              Ir para checkout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Teste grátis PainelCRM</CardTitle>
          <CardDescription>Foundation Sprint 6 — coexistente com signup legado</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="phone">WhatsApp</Label>
              <Input id="phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Começar teste grátis'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
