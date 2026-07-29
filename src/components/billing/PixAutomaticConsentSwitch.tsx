/**
 * Switch de consentimento — débito automático via PIX (SSOT na assinatura).
 * Usado em Meu plano, checkout, /saas-pay e /pay (CRM).
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type PixAutomaticSwitchState = {
  available: boolean;
  switch_on: boolean;
  status: string | null;
  has_active?: boolean;
};

type Props = {
  state: PixAutomaticSwitchState | null | undefined;
  disabled?: boolean;
  className?: string;
  /** Ligar: inicia auth / jornada. Desligar: cancela auth. */
  onToggle: (nextOn: boolean) => Promise<void> | void;
  /** Texto curto opcional sob o switch (linguagem de produto, sem jargão). */
  hint?: string | null;
  /** Rótulo amigável (CRM6). Default: "Débito automático via PIX". */
  label?: string | null;
};

/** Rótulo padrão de produto (evita jargão "Pix Automático" na UI). */
export const PIX_AUTOMATIC_SWITCH_LABEL_PT = 'Débito automático via PIX';

function statusLabelFor(state: PixAutomaticSwitchState): string {
  if (state.status === 'requested') {
    return 'Pedido — a autorização será preparada na próxima fatura do ciclo';
  }
  if (state.status === 'pending') {
    return 'Quase lá — autorize no app do banco ao pagar este PIX';
  }
  if (state.has_active || state.status === 'active') {
    return 'Ativo — próximas cobranças podem ser debitadas automaticamente';
  }
  if (state.switch_on) {
    return 'As próximas faturas poderão ser cobradas automaticamente após esta autorização.';
  }
  return 'Desligado — você paga cada fatura manualmente';
}

export function PixAutomaticConsentSwitch({
  state,
  disabled,
  className,
  onToggle,
  hint,
  label,
}: Props) {
  const [busy, setBusy] = useState(false);

  if (!state?.available) return null;

  const checked = !!state.switch_on;
  const title = (label ?? PIX_AUTOMATIC_SWITCH_LABEL_PT).trim() || PIX_AUTOMATIC_SWITCH_LABEL_PT;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="pix-automatic-switch" className="text-sm font-medium">
              {title}
            </Label>
            <p className="text-xs text-muted-foreground leading-snug">{statusLabelFor(state)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            <Switch
              id="pix-automatic-switch"
              checked={checked}
              disabled={disabled || busy}
              onCheckedChange={(v) => {
                void (async () => {
                  setBusy(true);
                  try {
                    await onToggle(v);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />
          </div>
        </div>
        {hint ? <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Motivos de fatura em que default ON + auto-enable fazem sentido (1ª compra / renovação de plano). */
export function isPixAutomaticDefaultOnBillingReason(reason: string | null | undefined): boolean {
  const r = (reason ?? 'plan_purchase').toLowerCase();
  return r === 'plan_purchase' || r === 'plan_upgrade' || r === 'plan_renewal';
}
