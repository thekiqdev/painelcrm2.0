import React from 'react';
import { Check, KeyRound, MessageCircle, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

type Props = {
  onOpenPassword: () => void;
  whatsappDigits: string;
};

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
          ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-muted bg-muted/40 text-muted-foreground',
        )}
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </span>
      <span className={cn('font-medium', ok ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
    </div>
  );
}

export function ProfileSecurityCard({ onOpenPassword, whatsappDigits }: Props) {
  const d = whatsappDigits.replace(/\D/g, '');
  const hasWhatsapp = d.length >= 10 && d.length <= 13;

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-semibold">Segurança da conta</CardTitle>
        </div>
        <CardDescription className="text-sm leading-relaxed">
          Proteja seu acesso. Para alterar sua senha, enviaremos um código de confirmação para seu WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasWhatsapp ? (
          <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50">
            <MessageCircle className="h-4 w-4 text-amber-700 dark:text-amber-200" />
            <AlertTitle className="text-amber-950 dark:text-amber-50">WhatsApp necessário</AlertTitle>
            <AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
              Cadastre um WhatsApp válido em Informações pessoais para alterar sua senha com segurança.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Indicadores</p>
          <StatusLine ok={hasWhatsapp} label="WhatsApp cadastrado" />
          <StatusLine ok={hasWhatsapp} label="Código por WhatsApp disponível" />
          <p className="pt-1 text-xs text-muted-foreground">
            Histórico de alteração de senha e último acesso não estão disponíveis nesta tela.
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          className="h-12 w-full rounded-xl md:w-auto md:min-w-[240px]"
          onClick={onOpenPassword}
          disabled={!hasWhatsapp}
        >
          <KeyRound className="mr-2 h-4 w-4" />
          Alterar senha
        </Button>
      </CardContent>
    </Card>
  );
}
