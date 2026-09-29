import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Store,
  Headphones,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import {
  changeMyTenantDomainRole,
  clearMyTenantDomain,
  listMyTenantDomains,
  setMyTenantDomain,
  tenantDomainRoleLabel,
  tenantDomainStatusLabel,
  verifyMyTenantDomain,
  type TenantDomainInstructions,
  type TenantHostRole,
} from '@/services/tenantDomain';
import { invalidateTenantCanonicalUrlCache } from '@/lib/tenantCanonicalUrls';
import type { SettingsSectionProps } from './types';

const ROLE_COPY: Record<
  TenantHostRole,
  { title: string; description: string; placeholder: string; icon: typeof Store }
> = {
  store: {
    title: 'Loja',
    description: 'Clientes acessam sua vitrine neste endereço.',
    placeholder: 'loja.suaempresa.com.br',
    icon: Store,
  },
  support: {
    title: 'Abertura de chamados',
    description: 'Clientes abrem e acompanham chamados neste endereço.',
    placeholder: 'suporte.suaempresa.com.br',
    icon: Headphones,
  },
};

function DnsBlock({ item }: { item: TenantDomainInstructions }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
      <p className="font-medium text-foreground">Instruções DNS</p>
      <div>
        <strong>TXT host:</strong> {item.txt_host}
      </div>
      <div className="break-all">
        <strong>TXT value:</strong> {item.txt_value}
      </div>
      {item.cname_target ? (
        <>
          <div>
            <strong>CNAME host:</strong> {item.cname_host}
          </div>
          <div>
            <strong>CNAME target:</strong> {item.cname_target}
          </div>
        </>
      ) : null}
      {item.bypass_enabled ? (
        <p className="text-amber-700 dark:text-amber-300">
          Bypass de verificação DNS ativo neste ambiente (dev).
        </p>
      ) : null}
    </div>
  );
}

function HostRoleCard({
  role,
  item,
  canSave,
  busy,
  onSave,
  onVerify,
  onClear,
  onChangeRole,
}: {
  role: TenantHostRole;
  item: TenantDomainInstructions | null;
  canSave: boolean;
  busy: boolean;
  onSave: (hostname: string, role: TenantHostRole) => Promise<boolean>;
  onVerify: (role: TenantHostRole) => Promise<void>;
  onClear: (role: TenantHostRole) => void;
  onChangeRole: (from: TenantHostRole, to: TenantHostRole) => void;
}) {
  const meta = ROLE_COPY[role];
  const Icon = meta.icon;
  const [hostname, setHostname] = useState(item?.hostname ?? '');
  const otherRole: TenantHostRole = role === 'store' ? 'support' : 'store';

  useEffect(() => {
    setHostname(item?.hostname ?? '');
  }, [item?.hostname, item?.id]);

  const configured = Boolean(item?.hostname);
  const verified = item?.status === 'verified' || item?.status === 'active';
  const active = item?.status === 'active';

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-muted p-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{meta.title}</CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </div>
          </div>
          {item ? (
            <Badge variant={verified ? 'default' : 'outline'}>
              {tenantDomainStatusLabel(item.status)}
            </Badge>
          ) : (
            <Badge variant="outline">Não configurado</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`domain-${role}`}>Hostname (subdomínio)</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`domain-${role}`}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder={meta.placeholder}
              disabled={!canSave || busy}
            />
            <Button
              disabled={!canSave || busy || !hostname.trim()}
              onClick={() => void onSave(hostname.trim(), role)}
            >
              {configured ? 'Atualizar' : 'Salvar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use um subdomínio (ex.: {meta.placeholder}). Este endereço é para clientes finais — não
            substitui o login do painel CRM.
          </p>
        </div>

        {item ? (
          <>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Configurado: <span className="font-medium">{item.hostname}</span>
              </li>
              <li className="flex items-center gap-2">
                {verified ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                DNS {verified ? 'verificado' : 'pendente'}
              </li>
            </ul>

            {(item.status === 'pending' || item.status === 'error' || !verified) && (
              <DnsBlock item={item} />
            )}
            {verified && item.bypass_enabled ? <DnsBlock item={item} /> : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!canSave || busy}
                onClick={() => void onVerify(role)}
              >
                Verificar DNS
              </Button>
              {active ? (
                <Button variant="outline" asChild>
                  <a
                    href={item.canonical_public_url || `https://${item.hostname}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir {role === 'store' ? 'loja' : 'portal'}
                  </a>
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={!canSave || busy}
                onClick={() => onChangeRole(role, otherRole)}
              >
                Mudar uso para {tenantDomainRoleLabel(otherRole)}
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={!canSave || busy}
                onClick={() => onClear(role)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export const DomainSection: React.FC<SettingsSectionProps> = () => {
  const { canEdit } = useModulePermissions();
  const canSave = canEdit('settings');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<TenantDomainInstructions[]>([]);
  const [gate, setGate] = useState<'ok' | 'disabled' | 'ineligible' | 'error'>('ok');
  const [gateMessage, setGateMessage] = useState<string | null>(null);

  const [confirmClearRole, setConfirmClearRole] = useState<TenantHostRole | null>(null);
  const [confirmChange, setConfirmChange] = useState<{
    from: TenantHostRole;
    to: TenantHostRole;
  } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<{
    hostname: string;
    role: TenantHostRole;
  } | null>(null);

  const byRole = useMemo(() => {
    const map: Record<TenantHostRole, TenantDomainInstructions | null> = {
      store: null,
      support: null,
    };
    for (const it of items) {
      if (it.role === 'store' || it.role === 'support') map[it.role] = it;
    }
    return map;
  }, [items]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await listMyTenantDomains();
    if (res.error) {
      if (res.code === 'FEATURE_DISABLED') {
        setGate('disabled');
        setGateMessage(res.error);
        setItems([]);
      } else if (res.code === 'TENANT_NOT_ELIGIBLE') {
        setGate('ineligible');
        setGateMessage(res.error);
        setItems([]);
      } else {
        setGate('error');
        setGateMessage(res.error);
        setItems([]);
      }
    } else {
      setGate('ok');
      setGateMessage(null);
      setItems(res.data?.items ?? []);
      invalidateTenantCanonicalUrlCache();
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doSave = async (hostname: string, role: TenantHostRole) => {
    if (!canSave) {
      toast.error('Sem permissão para alterar configurações.');
      return false;
    }
    setBusy(true);
    const res = await setMyTenantDomain({ hostname, role });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Domínio salvo. Configure o DNS e verifique.');
    await refresh();
    return true;
  };

  const handleSaveClick = async (hostname: string, role: TenantHostRole) => {
    const existing = byRole[role];
    if (existing && existing.hostname !== hostname.toLowerCase().replace(/^https?:\/\//, '')) {
      setConfirmReplace({ hostname, role });
      return;
    }
    await doSave(hostname, role);
  };

  const handleVerify = async (role: TenantHostRole) => {
    if (!canSave) {
      toast.error('Sem permissão para alterar configurações.');
      return;
    }
    setBusy(true);
    const res = await verifyMyTenantDomain(role);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data?.verified) {
      toast.success(`DNS verificado (${res.data.method}). Domínio ativo.`);
    } else {
      toast.error('DNS ainda não propagou. Confira TXT/CNAME e tente de novo.');
    }
    await refresh();
  };

  const handleClear = async (role: TenantHostRole) => {
    setBusy(true);
    const res = await clearMyTenantDomain({ role });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Domínio removido.');
    setConfirmClearRole(null);
    await refresh();
  };

  const handleChangeRole = async (from: TenantHostRole, to: TenantHostRole) => {
    setBusy(true);
    const res = await changeMyTenantDomainRole({ from_role: from, to_role: to });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `Uso alterado para ${tenantDomainRoleLabel(to)}. O hostname e o DNS permaneceram.`
    );
    setConfirmChange(null);
    await refresh();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando domínio…
        </CardContent>
      </Card>
    );
  }

  if (gate === 'disabled') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Domínio personalizado</CardTitle>
          <CardDescription>
            Recurso ainda não habilitado para este tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {gateMessage ||
            'Peça ao suporte da plataforma para ativar a flag tenant.custom_domain_v1.'}
        </CardContent>
      </Card>
    );
  }

  if (gate === 'ineligible') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Domínio personalizado</CardTitle>
          <CardDescription>Indisponível para este tipo de conta.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {gateMessage ||
            'Domínio próprio de loja/chamados está disponível apenas para clientes Platform.'}
        </CardContent>
      </Card>
    );
  }

  if (gate === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Domínio personalizado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">{gateMessage}</p>
          <Button variant="outline" onClick={() => void refresh()}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Domínio personalizado</CardTitle>
          <CardDescription>
            Configure um subdomínio para a <strong>loja</strong> e/ou para a{' '}
            <strong>abertura de chamados</strong>. Cada uso precisa de um hostname diferente. Este
            endereço é para clientes finais — não é o login do painel CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Como funciona</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Escolha o uso (loja ou chamados) no card correspondente.</li>
              <li>Informe o subdomínio e salve.</li>
              <li>Crie o registro TXT (e CNAME, se indicado) no seu DNS.</li>
              <li>Clique em Verificar DNS. Quando ativo, clientes abrem a superfície pública nesse host.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <HostRoleCard
        role="store"
        item={byRole.store}
        canSave={canSave}
        busy={busy}
        onSave={handleSaveClick}
        onVerify={handleVerify}
        onClear={(r) => setConfirmClearRole(r)}
        onChangeRole={(from, to) => setConfirmChange({ from, to })}
      />

      <HostRoleCard
        role="support"
        item={byRole.support}
        canSave={canSave}
        busy={busy}
        onSave={handleSaveClick}
        onVerify={handleVerify}
        onClear={(r) => setConfirmClearRole(r)}
        onChangeRole={(from, to) => setConfirmChange({ from, to })}
      />

      <AlertDialog
        open={confirmClearRole != null}
        onOpenChange={(open) => {
          if (!open) setConfirmClearRole(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover domínio?</AlertDialogTitle>
            <AlertDialogDescription>
              O hostname{' '}
              <strong className="text-foreground">
                {confirmClearRole ? byRole[confirmClearRole]?.hostname : ''}
              </strong>{' '}
              ({confirmClearRole ? tenantDomainRoleLabel(confirmClearRole) : ''}) será desvinculado.
              A superfície pública voltará a usar apenas o caminho com slug da plataforma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !confirmClearRole}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmClearRole) void handleClear(confirmClearRole);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmChange != null}
        onOpenChange={(open) => {
          if (!open) setConfirmChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mudar o uso deste domínio?</AlertDialogTitle>
            <AlertDialogDescription>
              O hostname{' '}
              <strong className="text-foreground">
                {confirmChange ? byRole[confirmChange.from]?.hostname : ''}
              </strong>{' '}
              passará de{' '}
              <strong>{confirmChange ? tenantDomainRoleLabel(confirmChange.from) : ''}</strong> para{' '}
              <strong>{confirmChange ? tenantDomainRoleLabel(confirmChange.to) : ''}</strong>. O DNS
              permanece; só o roteamento muda (loja ↔ portal de chamados).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !confirmChange}
              onClick={(e) => {
                e.preventDefault();
                if (confirmChange) void handleChangeRole(confirmChange.from, confirmChange.to);
              }}
            >
              Confirmar troca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmReplace != null}
        onOpenChange={(open) => {
          if (!open) setConfirmReplace(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir hostname?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso troca o hostname atual e reinicia a verificação DNS (novo token TXT).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !confirmReplace}
              onClick={async (e) => {
                e.preventDefault();
                if (!confirmReplace) return;
                const ok = await doSave(confirmReplace.hostname, confirmReplace.role);
                if (ok) setConfirmReplace(null);
              }}
            >
              Substituir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
