import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Users, UserCircle, HardDrive, Contact, AlertTriangle, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/api/client';
import { useTenantDetail } from '@/contexts/TenantDetailContext';

interface UsageItem {
  current: number;
  limit: number | null;
}

interface TenantUsagePayload {
  users: UsageItem;
  profiles: UsageItem;
  whatsapp_instances?: UsageItem;
  storage_mb: number | null;
  contacts_count: number | null;
  plan_limits: {
    max_users: number | null;
    max_profiles: number | null;
    max_whatsapp_instances?: number | null;
  };
  overrides?: {
    max_users: number | null;
    max_profiles: number | null;
    max_whatsapp_instances?: number | null;
  };
}

function UsageCard({
  title,
  description,
  current,
  limit,
  icon: Icon,
  unit = '',
}: {
  title: string;
  description?: string;
  current: number;
  limit: number | null;
  icon: React.ElementType;
  unit?: string;
}) {
  const hasLimit = limit != null && limit > 0;
  const percent = hasLimit ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  const nearLimit = hasLimit && percent >= 80 && percent < 100;
  const atLimit = hasLimit && current >= limit;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {current}
            {hasLimit ? ` / ${limit}${unit}` : unit ? ` ${unit}` : ''}
          </span>
          {hasLimit && (
            <span className="text-muted-foreground">{percent}%</span>
          )}
        </div>
        {hasLimit && (
          <Progress value={percent} className="h-2" />
        )}
        {nearLimit && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Próximo do limite.
          </p>
        )}
        {atLimit && limit != null && limit > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Limite atingido.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminClientLimites() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useTenantDetail();
  const [data, setData] = useState<TenantUsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLimits, setSavingLimits] = useState(false);
  const [overrideUsers, setOverrideUsers] = useState<string>('');
  const [overrideProfiles, setOverrideProfiles] = useState<string>('');
  const [overrideWhatsApp, setOverrideWhatsApp] = useState<string>('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const res = await apiClient.get<TenantUsagePayload>(`/api/superadmin/tenants/${id}/usage`);
    if (res.data) {
      setData(res.data);
      setOverrideUsers(res.data.overrides?.max_users != null ? String(res.data.overrides.max_users) : '');
      setOverrideProfiles(res.data.overrides?.max_profiles != null ? String(res.data.overrides.max_profiles) : '');
      setOverrideWhatsApp(res.data.overrides?.max_whatsapp_instances != null ? String(res.data.overrides.max_whatsapp_instances) : '');
    }
    if (res.error) toast.error(res.error);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const saveLimits = async () => {
    if (!id) return;
    setSavingLimits(true);
    const toNum = (s: string) => {
      const n = parseInt(s.trim(), 10);
      return s.trim() === '' || isNaN(n) ? null : n;
    };
    const res = await apiClient.put<{ overrides: TenantUsagePayload['overrides'] }>(
      `/api/superadmin/tenants/${id}/limits`,
      {
        max_users: toNum(overrideUsers),
        max_profiles: toNum(overrideProfiles),
        max_whatsapp_instances: toNum(overrideWhatsApp),
      }
    );
    setSavingLimits(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Limites personalizados salvos.');
    load();
  };

  if (!tenant) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Limites e uso</h2>
        <p className="text-sm text-muted-foreground">
          Consumo atual e limites do plano para esta empresa. Você pode definir limites personalizados por tenant.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <UsageCard
              title="Usuários"
              description="Contas de usuário na empresa"
              current={data.users.current}
              limit={data.users.limit}
              icon={Users}
            />
            <UsageCard
              title="Perfis"
              description="Perfis de atendimento (user_profiles)"
              current={data.profiles.current}
              limit={data.profiles.limit}
              icon={UserCircle}
            />
            {data.whatsapp_instances && (
              <UsageCard
                title="Instâncias WhatsApp"
                description="Conexões WhatsApp (chat_instances)"
                current={data.whatsapp_instances.current}
                limit={data.whatsapp_instances.limit}
                icon={MessageCircle}
              />
            )}
            {data.storage_mb != null && (
              <UsageCard
                title="Armazenamento"
                description="Espaço utilizado"
                current={data.storage_mb}
                limit={null}
                icon={HardDrive}
                unit=" MB"
              />
            )}
            {data.contacts_count != null && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Contact className="h-4 w-4" />
                    Leads
                  </CardTitle>
                  <CardDescription>Quantidade de leads (informativo, sem limite no plano)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{data.contacts_count}</div>
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Limites personalizados</CardTitle>
              <CardDescription>
                Defina um limite específico para esta empresa. Deixe em branco para usar o limite do plano.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Usuários (limite personalizado)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={data.plan_limits.max_users != null ? `Plano: ${data.plan_limits.max_users}` : 'Ilimitado no plano'}
                    value={overrideUsers}
                    onChange={(e) => setOverrideUsers(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Perfis (limite personalizado)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={data.plan_limits.max_profiles != null ? `Plano: ${data.plan_limits.max_profiles}` : 'Ilimitado no plano'}
                    value={overrideProfiles}
                    onChange={(e) => setOverrideProfiles(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instâncias WhatsApp (limite personalizado)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={
                      data.plan_limits.max_whatsapp_instances != null
                        ? `Plano: ${data.plan_limits.max_whatsapp_instances}`
                        : 'Ilimitado no plano'
                    }
                    value={overrideWhatsApp}
                    onChange={(e) => setOverrideWhatsApp(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={saveLimits} disabled={savingLimits}>
                {savingLimits ? 'Salvando...' : 'Salvar limites personalizados'}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <p className="text-muted-foreground text-center">Não foi possível carregar o uso.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
