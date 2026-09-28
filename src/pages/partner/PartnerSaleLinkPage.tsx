import React, { useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerEmptyState, PartnerSectionHeader } from './PartnerSectionHeader';

export default function PartnerSaleLinkPage() {
  const {
    isAdmin,
    isSeller,
    houseLink,
    sellerLink,
    me,
    saving,
    copySaleLink,
    clearDomain,
  } = usePartnerPanel();
  const [confirmClear, setConfirmClear] = useState(false);

  const link = isSeller ? sellerLink?.sale_url : houseLink?.sale_url;
  const code = isSeller ? sellerLink?.referral_code : null;
  const hasCustomDomain = Boolean(me?.profile.custom_domain);

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title={isSeller ? 'Meu link de vendas' : 'Link de vendas'}
        description={
          isSeller
            ? 'Compartilhe este link para atribuir novos clientes à sua carteira.'
            : 'Link da casa: clientes sem vendedor entram na carteira da agência.'
        }
      />

      {!link ? (
        <PartnerEmptyState title="Link ainda não disponível" description="Tente atualizar a página em instantes." />
      ) : (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Seu link de vendas</CardTitle>
              <CardDescription>
                {hasCustomDomain
                  ? `Domínio do canal: ${me!.profile.custom_domain}`
                  : 'Usando o domínio padrão da plataforma.'}
              </CardDescription>
            </div>
            <Badge variant="secondary">Pronto para compartilhar</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="break-all rounded-md border bg-muted/30 px-3 py-2 text-sm">{link}</p>
            {code ? (
              <p className="text-xs text-muted-foreground">
                Código de indicação: <code>{code}</code>
              </p>
            ) : null}
            {isAdmin ? (
              <p className="text-xs text-muted-foreground">
                Sem domínio próprio, o link usa <code>/{'{seu-slug}'}/cadastro</code>. Com domínio
                verificado, usa o hostname do canal (<code>/cadastro</code>). Em desenvolvimento local, abra o
                painel na mesma porta do app (ex. <code>8081</code>) ou defina{' '}
                <code>PUBLIC_APP_URL</code> / <code>FRONTEND_URL</code> no backend.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void copySaleLink(link)}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar link
              </Button>
              {isAdmin && hasCustomDomain ? (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={saving}
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remover domínio
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover domínio e voltar ao link padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              O domínio <strong className="text-foreground">{me?.profile.custom_domain}</strong> será
              desvinculado. O link de vendas voltará à configuração inicial na plataforma (
              <code>/{'{slug}'}/cadastro</code>).
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
