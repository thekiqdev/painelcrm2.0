import React, { useState } from 'react';
import { CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerEmptyState, PartnerSectionHeader } from './PartnerSectionHeader';
import { domainStatusLabel } from './partnerTypes';

export default function PartnerDomainPage() {
  const {
    me,
    domainInput,
    setDomainInput,
    domainInfo,
    saving,
    saveDomain,
    verifyDomain,
    clearDomain,
  } = usePartnerPanel();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!me) return null;

  const configured = Boolean(me.profile.custom_domain);
  const verified =
    me.profile.domain_status === 'verified' || me.profile.domain_status === 'active';

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Domínio"
        description="Endereço onde seus clientes acessarão o sistema com a sua marca."
        actions={
          <Button onClick={() => setOpen(true)}>
            {configured ? 'Alterar domínio' : 'Configurar domínio'}
          </Button>
        }
      />

      {!configured ? (
        <PartnerEmptyState
          title="Seu domínio ainda não está configurado"
          description="Use um hostname próprio (ex.: crm.suaempresa.com.br) para a experiência white-label completa."
          action={<Button onClick={() => setOpen(true)}>Configurar domínio</Button>}
        />
      ) : (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Domínio atual</CardTitle>
            <CardDescription>{me.profile.custom_domain}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={verified ? 'default' : 'outline'}>
                {domainStatusLabel(me.profile.domain_status)}
              </Badge>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                {configured ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                Configurado
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
            {domainInfo?.txt_host ? (
              <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
                <div>
                  <strong>TXT host:</strong> {domainInfo.txt_host}
                </div>
                <div>
                  <strong>TXT value:</strong> {domainInfo.txt_value}
                </div>
                {domainInfo.bypass_enabled ? (
                  <div className="text-amber-700 dark:text-amber-300">
                    Bypass de verificação DNS ativo no ambiente.
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={saving || !me.profile.custom_domain}
                onClick={() => void verifyDomain()}
              >
                Verificar DNS
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={saving}
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover domínio
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ao remover, o link de vendas volta para o formato padrão da plataforma (
              <code>/{'{slug}'}/cadastro</code>).
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar domínio</DialogTitle>
            <DialogDescription>
              Informe o hostname que apontará para o canal. Depois salve e valide o DNS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="partner-domain">Hostname</Label>
            <Input
              id="partner-domain"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="crm.suaempresa.com.br"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saving || !domainInput.trim()}
              onClick={async () => {
                const ok = await saveDomain();
                if (ok) setOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover domínio do canal?</AlertDialogTitle>
            <AlertDialogDescription>
              O domínio <strong className="text-foreground">{me.profile.custom_domain}</strong> será
              desvinculado. O link de vendas voltará a usar o endereço padrão da plataforma. Você
              poderá configurar outro domínio depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                const ok = await clearDomain();
                if (ok) setConfirmClear(false);
              }}
            >
              Remover domínio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
