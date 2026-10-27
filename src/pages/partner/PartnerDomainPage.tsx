import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, ExternalLink, Trash2 } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerEmptyState, PartnerSectionHeader } from './PartnerSectionHeader';
import {
  cfSslStatusLabel,
  domainStatusLabel,
  isCfSslPending,
  partnerChannelCheckoutUrl,
} from './partnerTypes';

export default function PartnerDomainPage() {
  const {
    me,
    domainInput,
    setDomainInput,
    domainInfo,
    saving,
    saveDomain,
    verifyDomain,
    syncDomainCloudflare,
    clearDomain,
  } = usePartnerPanel();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!me) return null;

  const configured = Boolean(me.profile.custom_domain);
  const verified =
    me.profile.domain_status === 'verified' || me.profile.domain_status === 'active';
  const sslStatus = domainInfo?.cf_ssl_status ?? null;
  const sslActive = sslStatus?.toLowerCase() === 'active';
  const sslPending = isCfSslPending(sslStatus);
  const checkoutUrl = partnerChannelCheckoutUrl(me.profile.custom_domain);
  const canOpenCheckout = verified && Boolean(checkoutUrl);

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Domínio"
        description="Subdomínio onde seus clientes acessam o canal com a sua marca e compram seus planos."
        actions={
          <Button onClick={() => setOpen(true)}>
            {configured ? 'Alterar domínio' : 'Configurar domínio'}
          </Button>
        }
      />

      {!configured ? (
        <PartnerEmptyState
          title="Seu subdomínio ainda não está configurado"
          description="Use um subdomínio (ex.: crm.suaempresa.com.br). Domínio raiz (suaempresa.com.br) não é suportado neste momento."
          action={<Button onClick={() => setOpen(true)}>Configurar domínio</Button>}
        />
      ) : (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Subdomínio do canal</CardTitle>
            <CardDescription>{me.profile.custom_domain}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={verified ? 'default' : 'outline'}>
                DNS: {domainStatusLabel(me.profile.domain_status)}
              </Badge>
              <Badge variant={sslActive ? 'default' : 'secondary'}>
                SSL: {cfSslStatusLabel(sslStatus)}
              </Badge>
            </div>

            {verified && sslPending ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Certificado em provisionamento</AlertTitle>
                <AlertDescription>
                  O DNS já está verificado. A Cloudflare ainda está emitindo o certificado HTTPS —
                  isso costuma levar alguns minutos. Você já pode abrir o checkout; se o browser
                  alertar sobre o certificado, aguarde e tente de novo.
                </AlertDescription>
              </Alert>
            ) : null}

            {domainInfo?.cf_last_error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Falha no edge (Cloudflare)</AlertTitle>
                <AlertDescription>
                  {domainInfo.cf_last_error}. O domínio pode continuar ativo no painel; confira o
                  DNS (CNAME) e tente Verificar DNS novamente.
                </AlertDescription>
              </Alert>
            ) : null}

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
              <li className="flex items-center gap-2">
                {sslActive ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                HTTPS {sslActive ? 'ativo' : sslPending ? 'provisionando' : 'pendente'}
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
                {domainInfo.cname_host && domainInfo.cname_target ? (
                  <>
                    <div>
                      <strong>CNAME host:</strong> {domainInfo.cname_host}
                    </div>
                    <div>
                      <strong>CNAME target:</strong> {domainInfo.cname_target}
                    </div>
                  </>
                ) : (
                  <div className="text-amber-700 dark:text-amber-300">
                    CNAME target ainda não configurado no servidor (PARTNER_WL_CNAME_TARGET).
                  </div>
                )}
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
              {verified ? (
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => void syncDomainCloudflare()}
                >
                  Atualizar status SSL
                </Button>
              ) : null}
              {canOpenCheckout && checkoutUrl ? (
                <Button variant="default" asChild>
                  <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir checkout do canal
                  </a>
                </Button>
              ) : null}
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
              Com o domínio ativo, o link de vendas usa{' '}
              <code>https://{me.profile.custom_domain}/cadastro</code>. Ao remover, volta para{' '}
              <code>/{'{slug}'}/cadastro</code> na plataforma.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar subdomínio</DialogTitle>
            <DialogDescription>
              Informe um subdomínio (ex.: crm.suaempresa.com.br). Não use o domínio raiz
              (suaempresa.com.br). Depois salve e valide o DNS (TXT + CNAME).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="partner-domain">Subdomínio</Label>
            <Input
              id="partner-domain"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="crm.suaempresa.com.br"
            />
            <p className="text-xs text-muted-foreground">
              Clientes compram seus planos em{' '}
              <code className="text-[11px]">https://seu-subdominio/cadastro</code>.
            </p>
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
