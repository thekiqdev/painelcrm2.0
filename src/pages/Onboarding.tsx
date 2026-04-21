import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/integrations/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';
import { Loader2, ChevronRight, ChevronLeft, User, Building2, CheckCircle } from 'lucide-react';
import LandingLayout from '@/landingpage/components/LandingLayout';

const ONBOARDING_TENANT_KEY = 'onboarding_tenant_id';

interface Prefill {
  name?: string;
  email?: string;
}

interface TenantData {
  company_name: string;
  cpf_cnpj: string;
  billing_email: string;
  billing_phone: string;
}

const STEPS = [
  { id: 1, title: 'Administrador', icon: User },
  { id: 2, title: 'Dados da empresa', icon: Building2 },
  { id: 3, title: 'Finalizar', icon: CheckCircle },
];

export default function Onboarding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading, setTokenAndUser, refreshUser } = useAuth();

  const stepFromUrl = Math.min(3, Math.max(1, parseInt(searchParams.get('step') || '1', 10)));
  const [step, setStep] = useState(stepFromUrl);
  const [tenantId, setTenantId] = useState<string | null>(() => {
    const stateTenant = (location.state as { tenantId?: string })?.tenantId;
    if (stateTenant) return stateTenant;
    return sessionStorage.getItem(ONBOARDING_TENANT_KEY);
  });
  const [prefill] = useState<Prefill>(() => (location.state as { prefill?: Prefill })?.prefill ?? {});

  const [admin, setAdmin] = useState({ name: prefill.name ?? '', email: prefill.email ?? '', password: '', confirmPassword: '' });
  const [company, setCompany] = useState<TenantData>({ company_name: '', cpf_cnpj: '', billing_email: '', billing_phone: '' });
  const [loading, setLoading] = useState(false);
  const [tenantDataLoaded, setTenantDataLoaded] = useState(false);
  const resolvedTenantId = tenantId ?? user?.tenant_id ?? null;

  useEffect(() => {
    const s = Math.min(3, Math.max(1, parseInt(searchParams.get('step') || '1', 10)));
    setStep(s);
  }, [searchParams]);

  useEffect(() => {
    if (resolvedTenantId) sessionStorage.setItem(ONBOARDING_TENANT_KEY, resolvedTenantId);
  }, [resolvedTenantId]);

  useEffect(() => {
    if (step === 2 && user && !tenantDataLoaded) {
      apiClient.get<TenantData>('/api/onboarding/tenant-data').then((res) => {
        if (res.data) {
          setCompany({
            company_name: res.data.company_name ?? '',
            cpf_cnpj: res.data.cpf_cnpj ?? '',
            billing_email: res.data.billing_email ?? '',
            billing_phone: res.data.billing_phone ?? '',
          });
          setTenantDataLoaded(true);
        }
      });
    }
  }, [step, user, tenantDataLoaded]);

  const handleStep = (next: number) => {
    const s = Math.min(3, Math.max(1, next));
    setStep(s);
    setSearchParams({ step: String(s) });
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedTenantId) {
      toast.error('Conta não identificada. Refaça o fluxo a partir do checkout.');
      return;
    }
    if (admin.password !== admin.confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    const res = await apiClient.post<{ token: string; user: { id: string; email: string; first_name?: string; last_name?: string; registration_complete?: boolean } }>(
      '/api/onboarding/create-admin',
      { tenant_id: resolvedTenantId, name: admin.name.trim(), email: admin.email.trim().toLowerCase(), password: admin.password }
    );
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data?.token && res.data?.user) {
      await setTokenAndUser(res.data.token, {
        id: res.data.user.id,
        email: res.data.user.email,
        first_name: res.data.user.first_name,
        last_name: res.data.user.last_name,
        registration_complete: res.data.user.registration_complete ?? true,
      });
      toast.success('Conta criada. Confirme os dados da empresa.');
      handleStep(2);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await apiClient.patch('/api/onboarding/company', {
      company_name: company.company_name.trim() || undefined,
      cpf_cnpj: company.cpf_cnpj.trim() || undefined,
      billing_email: company.billing_email.trim() || undefined,
      billing_phone: company.billing_phone.trim() || undefined,
    });
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Dados salvos.');
    handleStep(3);
  };

  const handleComplete = async () => {
    setLoading(true);
    const res = await apiClient.post('/api/onboarding/complete', {});
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    sessionStorage.removeItem(ONBOARDING_TENANT_KEY);
    toast.success('Onboarding concluído!');
    await refreshUser();
    navigate('/dashboard', { replace: true });
  };

  if (authLoading && step > 1) {
    return (
      <LandingLayout>
        <div className="flex justify-center items-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </LandingLayout>
    );
  }

  if (step === 1 && authLoading) {
    return (
      <LandingLayout>
        <div className="flex justify-center items-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </LandingLayout>
    );
  }

  if (step === 1 && !resolvedTenantId) {
    return (
      <LandingLayout>
        <div className="container max-w-md mx-auto py-16 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Acesso inválido</CardTitle>
              <CardDescription>
                Para criar o administrador, conclua o pagamento e use o link de redirecionamento, ou acesse a partir da página de planos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/landing')}>Ir para a página inicial</Button>
            </CardContent>
          </Card>
        </div>
      </LandingLayout>
    );
  }

  if (step >= 2 && !user) {
    return (
      <LandingLayout>
        <div className="container max-w-md mx-auto py-16 px-4">
          <Card>
            <CardHeader>
              <CardTitle>Sessão necessária</CardTitle>
              <CardDescription>Conclua a etapa 1 (criar administrador) para continuar.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => handleStep(1)}>Voltar ao passo 1</Button>
            </CardContent>
          </Card>
        </div>
      </LandingLayout>
    );
  }

  return (
    <LandingLayout>
      <div className="py-8 bg-muted/30 min-h-screen">
        <div className="container max-w-xl mx-auto px-4">
          <h1 className="text-2xl font-bold mb-6">Configuração inicial da conta</h1>
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = step === s.id;
              const done = step > s.id;
              return (
                <span key={s.id} className="inline-flex items-center gap-2">
                  <span
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {s.title}
                  </span>
                  {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </span>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{STEPS[step - 1].title}</CardTitle>
              <CardDescription>
                {step === 1 && 'Crie o usuário administrador da conta (você poderá adicionar mais usuários depois).'}
                {step === 2 && 'Confira e edite os dados da empresa para faturamento e suporte.'}
                {step === 3 && 'Tudo pronto. Finalize para acessar o painel.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {step === 1 && (
                <form onSubmit={handleCreateAdmin} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      value={admin.name}
                      onChange={(e) => setAdmin((a) => ({ ...a, name: e.target.value }))}
                      placeholder="Nome completo"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">E-mail *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={admin.email}
                      onChange={(e) => setAdmin((a) => ({ ...a, email: e.target.value }))}
                      placeholder="email@empresa.com"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Senha *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={admin.password}
                      onChange={(e) => setAdmin((a) => ({ ...a, password: e.target.value }))}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirmar senha *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={admin.confirmPassword}
                      onChange={(e) => setAdmin((a) => ({ ...a, confirmPassword: e.target.value }))}
                      placeholder="Repita a senha"
                      required
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Criar e continuar
                    </Button>
                  </div>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={handleSaveCompany} className="space-y-4">
                  <div>
                    <Label htmlFor="company_name">Nome da empresa *</Label>
                    <Input
                      id="company_name"
                      value={company.company_name}
                      onChange={(e) => setCompany((c) => ({ ...c, company_name: e.target.value }))}
                      placeholder="Razão social ou nome fantasia"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="cpf_cnpj">CPF ou CNPJ</Label>
                    <Input
                      id="cpf_cnpj"
                      value={company.cpf_cnpj}
                      onChange={(e) => setCompany((c) => ({ ...c, cpf_cnpj: e.target.value }))}
                      placeholder="Somente números"
                    />
                  </div>
                  <div>
                    <Label htmlFor="billing_email">E-mail para faturamento</Label>
                    <Input
                      id="billing_email"
                      type="email"
                      value={company.billing_email}
                      onChange={(e) => setCompany((c) => ({ ...c, billing_email: e.target.value }))}
                      placeholder="email@empresa.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="billing_phone">Telefone</Label>
                    <Input
                      id="billing_phone"
                      value={company.billing_phone}
                      onChange={(e) => setCompany((c) => ({ ...c, billing_phone: e.target.value }))}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => handleStep(1)}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Salvar e continuar
                    </Button>
                  </div>
                </form>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Sua conta está configurada. Clique em Finalizar para acessar o painel.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => handleStep(2)}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                    <Button onClick={handleComplete} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Finalizar e ir ao painel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </LandingLayout>
  );
}
