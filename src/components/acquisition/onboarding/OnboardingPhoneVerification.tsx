import { useEffect, useRef } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { activationInputClass } from './activationAppStyles';

export type PhoneVerificationUiState = 'idle' | 'sending' | 'sent' | 'verified';

type Props = {
  code: string;
  onChange: (code: string) => void;
  uiState: PhoneVerificationUiState;
  errorMessage?: string | null;
  resendCooldownSec: number;
  onResend: () => void;
  resendLoading?: boolean;
};

export function OnboardingPhoneVerification({
  code,
  onChange,
  uiState,
  errorMessage,
  resendCooldownSec,
  onResend,
  resendLoading,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (uiState === 'sent' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [uiState]);

  const digitsOnly = code.replace(/\D/g, '').slice(0, 6);

  if (uiState === 'sending') {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-8">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium text-foreground">Enviando código...</p>
      </div>
    );
  }

  if (uiState === 'verified') {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-8">
        <Check className="h-7 w-7 text-emerald-400" aria-hidden />
        <p className="text-sm font-semibold text-emerald-100">WhatsApp confirmado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="accessCode" className="text-sm text-muted-foreground">
          Código de 6 dígitos
        </Label>
        <Input
          ref={inputRef}
          id="accessCode"
          className={cn(activationInputClass, 'text-center text-lg tracking-[0.35em] tabular-nums')}
          value={digitsOnly}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
        />
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Não recebeu o código?</span>
        <button
          type="button"
          disabled={resendCooldownSec > 0 || resendLoading || uiState !== 'sent'}
          onClick={onResend}
          className={cn(
            'font-medium text-primary transition-opacity hover:underline',
            (resendCooldownSec > 0 || resendLoading) && 'pointer-events-none opacity-50',
          )}
        >
          {resendLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reenviando...
            </span>
          ) : resendCooldownSec > 0 ? (
            `Reenviar em ${resendCooldownSec}s`
          ) : (
            'Reenviar código'
          )}
        </button>
      </div>
    </div>
  );
}
