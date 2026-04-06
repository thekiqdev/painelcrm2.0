import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/api/client';
import { datetimeLocalToTrialEndsAtIso, trialEndsAtToDatetimeLocal } from '@/lib/trialEndsAtBrAdmin';

interface Plan {
  id: string;
  name: string;
  slug: string;
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  plan_id: string;
  plan_name?: string;
  plan_slug?: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
  users_count?: number;
}

interface PrimaryUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company_name: string;
}

interface PlanHistoryItem {
  plan_id: string;
  plan_name: string;
  starts_at: string;
  ends_at: string | null;
}

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  suspended: 'Desativado',
  trial: 'Trial',
};

export default function SuperAdminClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [primaryUser, setPrimaryUser] = useState<PrimaryUser | null>(null);
  const [planHistory, setPlanHistory] = useState<PlanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTenant, setSavingTenant] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [formTenant, setFormTenant] = useState({ name: '', slug: '', domain: '', plan_id: '', status: 'active', trial_ends_at: '' });
  const [formUser, setFormUser] = useState({ email: '', first_name: '', last_name: '', company_name: '' });
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const [tRes, pRes, uRes, hRes] = await Promise.all([
        apiClient.get<TenantDetail>(`/api/superadmin/tenants/${id}`),
        apiClient.get<Plan[]>('/api/superadmin/plans'),
        apiClient.get<PrimaryUser>(`/api/superadmin/tenants/${id}/primary-user`),
        apiClient.get<{ history: PlanHistoryItem[] }>(`/api/superadmin/tenants/${id}/plan-history`),
      ]);
      if (tRes.data) {
        setTenant(tRes.data);
        setFormTenant({
          name: tRes.data.name,
          slug: tRes.data.slug,
          domain: tRes.data.domain || '',
          plan_id: tRes.data.plan_id,
          status: tRes.data.status,
          trial_ends_at: trialEndsAtToDatetimeLocal(tRes.data.trial_ends_at),
        });
      }
      if (pRes.data) setPlans(pRes.data);
      if (uRes.data) {
        setPrimaryUser(uRes.data);
        setFormUser({
          email: uRes.data.email,
          first_name: uRes.data.first_name || '',
          last_name: uRes.data.last_name || '',
          company_name: uRes.data.company_name || '',
        });
      } else if (tRes.data) setPrimaryUser(null);
      if (hRes.data?.history) setPlanHistory(hRes.data.history);
      if (tRes.error) toast.error(tRes.error);
      setLoading(false);
    };
    load();
  }, [id]);

  const saveTenant = async () => {
    if (!id || !formTenant.name?.trim() || !formTenant.slug?.trim() || !formTenant.plan_id) {
      toast.error('Nome, slug e plano são obrigatórios.');
      return;
    }
    setSavingTenant(true);
    const res = await apiClient.put<TenantDetail>(`/api/superadmin/tenants/${id}`, {
      name: formTenant.name.trim(),
      slug: formTenant.slug.trim().toLowerCase(),
      domain: formTenant.domain || null,
      plan_id: formTenant.plan_id,
      status: formTenant.status,
      trial_ends_at: datetimeLocalToTrialEndsAtIso(formTenant.trial_ends_at),
    });
    setSavingTenant(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) setTenant(res.data);
    toast.success('Dados da empresa salvos.');
  };

  const savePrimaryUser = async () => {
    if (!id) return;
    setSavingUser(true);
    const res = await apiClient.put<PrimaryUser>(`/api/superadmin/tenants/${id}/primary-user`, {
      email: formUser.email || undefined,
      first_name: formUser.first_name || undefined,
      last_name: formUser.last_name || undefined,
      company_name: formUser.company_name || undefined,
    });
    setSavingUser(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) setPrimaryUser(res.data);
    toast.success('Contato principal atualizado.');
  };

  const savePassword = async () => {
    if (!primaryUser?.id || !newPassword || newPassword.length < 6) {
      toast.error('Senha deve ter no mínimo 6 caracteres');
      return;
    }
    setSavingPassword(true);
    const res = await apiClient.put(`/api/superadmin/users/${primaryUser.id}/password`, { new_password: newPassword });
    setSavingPassword(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setNewPassword('');
    toast.success('Senha alterada com sucesso.');
  };

  const saveStatus = async () => {
    if (!id) return;
    setSavingStatus(true);
    const res = await apiClient.put<TenantDetail>(`/api/superadmin/tenants/${id}`, { status: formTenant.status });
    setSavingStatus(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) setTenant(res.data);
    toast.success('Status atualizado.');
  };

  const deleteTenant = async () => {
    if (!id || !tenant) return;
    if (!confirm(`Excluir a empresa "${tenant.name}"? Usuários vinculados terão tenant_id = null.`)) return;
    setDeleting(true);
    const res = await apiClient.delete(`/api/superadmin/tenants/${id}`);
    setDeleting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Empresa excluída.');
    navigate('/superadmin/clients');
  };

  const handleSlugFromName = () => {
    const slug = (formTenant.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'empresa';
    setFormTenant((f) => ({ ...f, slug }));
  };

  if (!id) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">ID da empresa não informado.</p>
        <Button variant="outline" onClick={() => navigate('/superadmin/clients')}>
          Voltar para Empresas
        </Button>
      </div>
    );
  }

  if (loading) {
    return <p className="text-muted-foreground">Carregando...</p>;
  }

  if (!tenant) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Empresa não encontrada.</p>
        <Button variant="outline" onClick={() => navigate('/superadmin/clients')}>
          Voltar para Empresas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/superadmin/clients')} title="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-muted-foreground">Gerenciamento completo da empresa</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
          <CardDescription>Nome, identificador e plano.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={formTenant.name}
                onChange={(e) => setFormTenant((f) => ({ ...f, name: e.target.value }))}
                onBlur={handleSlugFromName}
                placeholder="Nome da empresa"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (identificador único)</Label>
              <Input
                value={formTenant.slug}
                onChange={(e) => setFormTenant((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="empresa-slug"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Domínio (opcional)</Label>
              <Input
                value={formTenant.domain}
                onChange={(e) => setFormTenant((f) => ({ ...f, domain: e.target.value }))}
                placeholder="app.empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select
                value={formTenant.plan_id}
                onValueChange={(v) => setFormTenant((f) => ({ ...f, plan_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trial até (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Horário de Brasília (America/Sao_Paulo). Gravado em UTC no servidor.
              </p>
              <Input
                type="datetime-local"
                value={formTenant.trial_ends_at}
                onChange={(e) => setFormTenant((f) => ({ ...f, trial_ends_at: e.target.value }))}
              />
            </div>
          </div>
          <Button onClick={saveTenant} disabled={savingTenant}>
            {savingTenant ? 'Salvando...' : 'Salvar dados da empresa'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status da conta</CardTitle>
          <CardDescription>Ativo, desativado ou trial.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Select
            value={formTenant.status}
            onValueChange={(v) => setFormTenant((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="suspended">Desativado</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="payment_pending">Aguardando pagamento</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={saveStatus} disabled={savingStatus}>
            {savingStatus ? 'Salvando...' : 'Atualizar status'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato principal</CardTitle>
          <CardDescription>E-mail e nome do primeiro usuário vinculado à empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {primaryUser ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>E-mail</Label>
                  <Input
                    value={formUser.email}
                    onChange={(e) => setFormUser((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={formUser.first_name}
                    onChange={(e) => setFormUser((f) => ({ ...f, first_name: e.target.value }))}
                    placeholder="Nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sobrenome</Label>
                  <Input
                    value={formUser.last_name}
                    onChange={(e) => setFormUser((f) => ({ ...f, last_name: e.target.value }))}
                    placeholder="Sobrenome"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Empresa (perfil)</Label>
                  <Input
                    value={formUser.company_name}
                    onChange={(e) => setFormUser((f) => ({ ...f, company_name: e.target.value }))}
                    placeholder="Nome da empresa"
                  />
                </div>
              </div>
              <Button onClick={savePrimaryUser} disabled={savingUser}>
                {savingUser ? 'Salvando...' : 'Salvar contato'}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">Nenhum usuário vinculado a esta empresa.</p>
          )}
        </CardContent>
      </Card>

      {primaryUser && (
        <Card>
          <CardHeader>
            <CardTitle>Alterar senha</CardTitle>
            <CardDescription>Definir nova senha para o usuário de login. Mínimo 6 caracteres.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
              />
            </div>
            <Button onClick={savePassword} disabled={savingPassword || newPassword.length < 6}>
              {savingPassword ? 'Salvando...' : 'Alterar senha'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Features da empresa</CardTitle>
          <CardDescription>Override de recursos por empresa. Valores sobrescrevem o plano.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate(`/superadmin/tenants/${id}/features`)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Gerenciar features
          </Button>
        </CardContent>
      </Card>

      {planHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de planos</CardTitle>
            <CardDescription>Alterações de plano desta empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {planHistory.map((h, i) => (
                <li key={i} className="flex justify-between border-b pb-2">
                  <span>{h.plan_name}</span>
                  <span className="text-muted-foreground">
                    {new Date(h.starts_at).toLocaleDateString('pt-BR')}
                    {h.ends_at ? ` – ${new Date(h.ends_at).toLocaleDateString('pt-BR')}` : ' – atual'}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Zona de perigo</CardTitle>
          <CardDescription>Excluir esta empresa. Usuários vinculados terão tenant_id = null.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={deleteTenant} disabled={deleting}>
            <Trash2 className="mr-2 h-4 w-4" />
            {deleting ? 'Excluindo...' : 'Excluir empresa'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
