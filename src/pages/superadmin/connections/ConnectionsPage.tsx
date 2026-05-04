import { useQuery } from '@tanstack/react-query';
import { MessageCircle, RadioTower } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import ConnectionCard from '@/components/superadmin/connections/ConnectionCard';
import { connectionsService } from '@/services/connections';
import { toast } from '@/hooks/use-toast';

export default function ConnectionsPage() {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['superadmin-connections-summary'],
    queryFn: () => connectionsService.getSummary(),
  });

  const wa = data?.whatsapp_official;
  const ua = data?.uazapi;

  const waStatus =
    wa?.feature_enabled === false
      ? 'Desativado na plataforma'
      : wa?.connected
        ? `Conectado${wa.display_phone_number ? ` · ${wa.display_phone_number}` : ''}`
        : wa?.status === 'disabled'
          ? 'Desligado'
          : 'Não conectado';

  const uaLine =
    ua != null
      ? `${ua.connected_count}/${ua.instances_count} ligada(s)`
      : undefined;

  const waBadgeVariant: 'default' | 'destructive' | 'secondary' =
    wa?.feature_enabled === false ? 'destructive' : wa?.connected ? 'default' : 'secondary';

  const uaBadgeVariant: 'default' | 'secondary' =
    (ua?.connected_count ?? 0) > 0 ? 'default' : 'secondary';

  const toggleGlobal = async (key: 'whatsapp_official_enabled' | 'whatsapp_official_tenant_enabled', next: boolean) => {
    try {
      await connectionsService.putFlag(key, next);
      toast({ title: 'Preferência guardada' });
      await refetch();
    } catch (e) {
      toast({
        title: 'Erro',
        description: String((e as Error).message),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conexões</h1>
        <p className="text-sm text-muted-foreground">
          Gestão centralizada de WhatsApp oficial (Meta) e UazAPI. As permissões de produto são persistidas na base de
          dados — sem dependência de variáveis de ambiente para ativar o módulo.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : (
        <>
          <div className="flex flex-col gap-6 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-3">
              <Switch
                id="wa-enabled"
                checked={wa?.feature_enabled ?? false}
                onCheckedChange={(v) => void toggleGlobal('whatsapp_official_enabled', v)}
              />
              <Label htmlFor="wa-enabled" className="cursor-pointer">
                WhatsApp oficial (Meta) visível no sistema
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="wa-tenant"
                checked={wa?.tenant_feature_enabled ?? false}
                onCheckedChange={(v) => void toggleGlobal('whatsapp_official_tenant_enabled', v)}
              />
              <Label htmlFor="wa-tenant" className="cursor-pointer">
                Permitir empresas (tenants) — futuro
              </Label>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <ConnectionCard
              title="WhatsApp oficial (Meta)"
              description="Cloud API, templates, campanhas e inbox no mesmo chat do CRM."
              to="/superadmin/conexoes/whatsapp-oficial"
              icon={MessageCircle}
              statusLine={waStatus}
              variant={waBadgeVariant}
            />
            <ConnectionCard
              title="WhatsApp (UazAPI)"
              description="Instâncias Evolution/UazAPI para automações e notificações da plataforma."
              to="/superadmin/conexoes/uazapi"
              icon={RadioTower}
              statusLine={uaLine}
              variant={uaBadgeVariant}
            />
          </div>
        </>
      )}
    </div>
  );
}
