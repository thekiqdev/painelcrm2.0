import React, { useEffect, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/sonner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { postMeProfilePasswordConfirm, postMeProfilePasswordRequestCode } from '@/services/profile';

const CODE_TTL_MS = 10 * 60 * 1000;

type Step = 'request' | 'confirm';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void | Promise<void>;
};

function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PasswordChangeDialog({ open, onOpenChange, onSuccess }: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [step, setStep] = useState<Step>('request');
  const [code, setCode] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep('request');
      setCode('');
      setPwdNew('');
      setPwdConfirm('');
      setExpiresAt(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!expiresAt || step !== 'confirm') return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [expiresAt, step]);

  const remainingSec = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : 0;
  const expired = step === 'confirm' && expiresAt != null && remainingSec <= 0;

  const sendCode = async () => {
    setBusy(true);
    try {
      const res = await postMeProfilePasswordRequestCode();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setStep('confirm');
      setExpiresAt(Date.now() + CODE_TTL_MS);
      toast.success('Código enviado ao WhatsApp.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (expired) {
      toast.error('Código expirado. Envie um novo código.');
      return;
    }
    setBusy(true);
    try {
      const res = await postMeProfilePasswordConfirm({
        code: code.replace(/\D/g, ''),
        new_password: pwdNew,
        confirm_password: pwdConfirm,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message || 'Senha atualizada.');
      onOpenChange(false);
      await onSuccess();
    } finally {
      setBusy(false);
    }
  };

  const bodyRequest = (
    <div className="grid gap-4 py-2">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Enviaremos um código de <strong className="text-foreground">6 dígitos</strong> para o{' '}
        <strong className="text-foreground">WhatsApp cadastrado</strong>. O código expira em{' '}
        <strong className="text-foreground">10 minutos</strong>.
      </p>
      {isMobile ? (
        <SheetFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="h-12 w-full rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" className="h-12 w-full rounded-xl" disabled={busy} onClick={() => void sendCode()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enviar código pelo WhatsApp
          </Button>
        </SheetFooter>
      ) : (
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" className="h-11 w-full sm:w-auto" disabled={busy} onClick={() => void sendCode()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enviar código pelo WhatsApp
          </Button>
        </DialogFooter>
      )}
    </div>
  );

  const bodyConfirm = (
    <div className="grid gap-4 py-2">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Tempo restante</span>
        <span className={expired ? 'font-medium text-destructive' : 'font-mono font-medium tabular-nums'}>
          {expired ? 'Expirado' : formatMmSs(remainingSec)}
        </span>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pwd-code">Código recebido</Label>
        <Input
          id="pwd-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-12 rounded-xl text-base tracking-widest sm:text-sm"
          placeholder="000000"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pwd-new">Nova senha</Label>
        <Input
          id="pwd-new"
          type="password"
          value={pwdNew}
          onChange={(e) => setPwdNew(e.target.value)}
          autoComplete="new-password"
          className="h-12 rounded-xl text-base sm:text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pwd-confirm">Confirmar nova senha</Label>
        <Input
          id="pwd-confirm"
          type="password"
          value={pwdConfirm}
          onChange={(e) => setPwdConfirm(e.target.value)}
          autoComplete="new-password"
          className="h-12 rounded-xl text-base sm:text-sm"
        />
      </div>
      {isMobile ? (
        <SheetFooter className="flex-col gap-2 pt-2">
          <Button type="button" variant="ghost" className="h-12 w-full" onClick={() => setStep('request')}>
            Voltar
          </Button>
          <Button type="button" className="h-12 w-full rounded-xl" disabled={busy || expired} onClick={() => void confirm()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar alteração
          </Button>
        </SheetFooter>
      ) : (
        <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
          <Button type="button" variant="ghost" className="h-11" onClick={() => setStep('request')}>
            Voltar
          </Button>
          <Button type="button" className="h-11" disabled={busy || expired} onClick={() => void confirm()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar alteração
          </Button>
        </DialogFooter>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[92dvh] max-h-[92dvh] overflow-y-auto rounded-t-2xl border-t-2 px-4 pb-8 pt-6">
          <SheetHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-4 w-4" />
              </span>
              <SheetTitle className="text-lg">Alterar senha</SheetTitle>
            </div>
            <SheetDescription>
              {step === 'request'
                ? 'Confirme pelo WhatsApp para definir uma nova senha.'
                : 'Digite o código e a nova senha.'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{step === 'request' ? bodyRequest : bodyConfirm}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl sm:max-w-md">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield className="h-4 w-4" />
            </span>
            <DialogTitle>Alterar senha</DialogTitle>
          </div>
          <DialogDescription>
            {step === 'request'
              ? 'Confirmação por WhatsApp. O código expira em 10 minutos.'
              : 'Digite o código recebido e a nova senha.'}
          </DialogDescription>
        </DialogHeader>
        {step === 'request' ? bodyRequest : bodyConfirm}
      </DialogContent>
    </Dialog>
  );
}
