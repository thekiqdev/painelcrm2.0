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
import { postMeProfileEditConfirmCode, postMeProfileEditRequestCode } from '@/services/profile';

const CODE_TTL_MS = 10 * 60 * 1000;

type Step = 'request' | 'confirm';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (profileEditToken: string) => void | Promise<void>;
};

function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ProfileEditUnlockDialog({ open, onOpenChange, onVerified }: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [step, setStep] = useState<Step>('request');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep('request');
      setCode('');
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
      const res = await postMeProfileEditRequestCode();
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
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      toast.error('Digite o código de 6 dígitos.');
      return;
    }
    setBusy(true);
    try {
      const res = await postMeProfileEditConfirmCode(digits);
      if (res.error || !res.profile_edit_token) {
        toast.error(res.error || 'Não foi possível confirmar.');
        return;
      }
      toast.success('Perfil desbloqueado para edição.');
      onOpenChange(false);
      await onVerified(res.profile_edit_token);
    } finally {
      setBusy(false);
    }
  };

  const bodyRequest = (
    <div className="grid gap-4 py-2">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Para editar nome, WhatsApp, cargo, preferências ou foto, enviaremos um código de{' '}
        <strong className="text-foreground">6 dígitos</strong> ao <strong className="text-foreground">WhatsApp cadastrado</strong>.
        O código expira em <strong className="text-foreground">10 minutos</strong>.
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
        <Label htmlFor="profile-unlock-code">Código recebido</Label>
        <Input
          id="profile-unlock-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-12 rounded-xl text-base tracking-widest sm:text-sm"
          placeholder="000000"
        />
      </div>
      {isMobile ? (
        <SheetFooter className="flex-col gap-2 pt-2">
          <Button type="button" variant="ghost" className="h-12 w-full" onClick={() => setStep('request')}>
            Voltar
          </Button>
          <Button type="button" className="h-12 w-full rounded-xl" disabled={busy || expired} onClick={() => void confirm()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar e editar perfil
          </Button>
        </SheetFooter>
      ) : (
        <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
          <Button type="button" variant="ghost" className="h-11" onClick={() => setStep('request')}>
            Voltar
          </Button>
          <Button type="button" className="h-11" disabled={busy || expired} onClick={() => void confirm()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar e editar perfil
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
              <SheetTitle className="text-lg">Confirmar edição do perfil</SheetTitle>
            </div>
            <SheetDescription>
              {step === 'request'
                ? 'Mesmo tipo de código usado para alterar a senha — enviado ao seu WhatsApp.'
                : 'Digite o código de 6 dígitos.'}
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
            <DialogTitle>Confirmar edição do perfil</DialogTitle>
          </div>
          <DialogDescription>
            {step === 'request'
              ? 'Enviaremos um código ao WhatsApp cadastrado (válido por 10 minutos).'
              : 'Digite o código recebido para desbloquear a edição.'}
          </DialogDescription>
        </DialogHeader>
        {step === 'request' ? bodyRequest : bodyConfirm}
      </DialogContent>
    </Dialog>
  );
}
