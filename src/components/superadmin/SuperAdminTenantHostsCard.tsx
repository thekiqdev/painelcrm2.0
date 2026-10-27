import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/sonner';
import {
  superadminClearTenantDomain,
  superadminListTenantDomains,
  superadminSyncTenantDomainCloudflare,
  tenantCfSslStatusLabel,
  tenantDomainRoleLabel,
  tenantDomainStatusLabel,
  type TenantHostRole,
  type TenantHostRowAdmin,
} from '@/services/tenantDomain';

type Props = {
  tenantId: string;
  accountType?: string | null;
};

export function SuperAdminTenantHostsCard({ tenantId, accountType }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<TenantHostRowAdmin[]>([]);
  const [clearTarget, setClearTarget] = useState<TenantHostRowAdmin | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await superadminListTenantDomains(tenantId);
    if (res.error) {
      toast.error(res.error);
      setItems([]);
    } else {
      setItems(res.data?.items ?? []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (accountType && accountType !== 'platform_customer') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Domínios personalizados (loja / chamados)</CardTitle>
          <CardDescription>
            Disponível apenas para clientes Platform (`platform_customer`).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleClear = async (row: TenantHostRowAdmin) => {
    setBusy(true);
    const res = await superadminClearTenantDomain(tenantId, { id: row.id });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Domínio removido.');
    setClearTarget(null);
    await refresh();
  };

  const handleCfSync = async (row: TenantHostRowAdmin) => {
    const role = row.role === 'support' ? 'support' : 'store';
    setBusy(true);
    const res = await superadminSyncTenantDomainCloudflare(
      tenantId,
      role as TenantHostRole
    );
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`SSL: ${tenantCfSslStatusLabel(res.data?.cf_ssl_status)}`);
    await refresh();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Domínios personalizados (loja / chamados)</CardTitle>
          <CardDescription>
            Hosts em `tenant_hosts` — superfícies públicas do tenant (não login do CRM). O campo
            “Domínio” legado acima é só metadado. Automação Cloudflare fica OFF até ligar{' '}
            <code className="text-xs">tenant.edge_cloudflare_saas_v1</code> em Avançado → Feature
            Flags. Cota CF é compartilhada com Partner (~100 hostnames grátis).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nenhum domínio personalizado configurado.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((row) => {
                const verified = row.status === 'verified' || row.status === 'active';
                const sslActive = (row.cf_ssl_status || '').toLowerCase() === 'active';
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">{row.hostname}</span>
                        <Badge variant="outline">{tenantDomainRoleLabel(String(row.role))}</Badge>
                        <Badge variant={verified ? 'default' : 'secondary'}>
                          DNS: {tenantDomainStatusLabel(row.status)}
                        </Badge>
                        <Badge variant={sslActive ? 'default' : 'outline'}>
                          SSL: {tenantCfSslStatusLabel(row.cf_ssl_status)}
                        </Badge>
                        {row.cf_ownership_status ? (
                          <Badge variant="secondary">CF: {row.cf_ownership_status}</Badge>
                        ) : null}
                      </div>
                      {row.cf_custom_hostname_id ? (
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          cf_id: {row.cf_custom_hostname_id}
                        </p>
                      ) : null}
                      {row.cf_last_error ? (
                        <p className="text-xs text-destructive">{row.cf_last_error}</p>
                      ) : null}
                      {row.last_error ? (
                        <p className="text-xs text-destructive">{row.last_error}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {(row.status === 'active' || row.status === 'verified') &&
                      (row.role === 'store' || row.role === 'support') ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleCfSync(row)}
                        >
                          Resync CF
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => setClearTarget(row)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={clearTarget != null}
        onOpenChange={(open) => {
          if (!open) setClearTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover domínio do tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              Remover <strong className="text-foreground">{clearTarget?.hostname}</strong> (
              {clearTarget ? tenantDomainRoleLabel(String(clearTarget.role)) : ''}). O tenant poderá
              configurar outro depois nas Configurações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !clearTarget}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (clearTarget) void handleClear(clearTarget);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
