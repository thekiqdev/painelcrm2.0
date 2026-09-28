import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatOnboardingActivationPrice } from './onboardingPricing';
import { ActivationBadge } from './ActivationBadge';
import type { PublicAcquisitionPlan } from './types';
import { CreditCard, Loader2, Shield } from 'lucide-react';

type Props = {
  leadName: string;
  leadEmail: string;
  plan: PublicAcquisitionPlan;
  usersCount: number;
  loading: boolean;
  cpfCnpj: string;
  paymentMethod: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
  onCpfCnpjChange: (v: string) => void;
  onPaymentMethodChange: (m: 'PIX' | 'BOLETO' | 'CREDIT_CARD') => void;
  onSubmit: () => void;
  pixCopyPaste?: string | null;
  invoiceUrl?: string | null;
};

export function OnboardingPaymentPanel({
  leadName,
  leadEmail,
  plan,
  usersCount,
  loading,
  cpfCnpj,
  paymentMethod,
  onCpfCnpjChange,
  onPaymentMethodChange,
  onSubmit,
  pixCopyPaste,
  invoiceUrl,
}: Props) {
  const priceLabel = formatOnboardingActivationPrice(plan, usersCount);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Plano</span>
          <span className="font-semibold">{plan.name}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Operador</span>
          <span className="truncate">{leadName}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">E-mail</span>
          <span className="truncate text-xs">{leadEmail}</span>
        </div>
        <div className="flex justify-between gap-2 border-t border-white/5 pt-2">
          <span className="text-muted-foreground">Investimento</span>
          <span className="font-bold tabular-nums text-primary">{priceLabel}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Empresa, senha e equipe serão configurados no onboarding após a confirmação do pagamento.
      </p>

      <div className="space-y-2">
        <Label>CPF/CNPJ (obrigatório para PIX)</Label>
        <Input
          value={cpfCnpj}
          onChange={(e) => onCpfCnpjChange(e.target.value)}
          placeholder="Documento fiscal"
          className="border-white/10 bg-white/5"
        />
      </div>

      <div className="space-y-2">
        <Label>Método de pagamento</Label>
        <div className="flex flex-wrap gap-2">
          {(['PIX', 'BOLETO', 'CREDIT_CARD'] as const).map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={paymentMethod === m ? 'default' : 'outline'}
              onClick={() => onPaymentMethodChange(m)}
            >
              {m === 'PIX' ? 'PIX' : m === 'BOLETO' ? 'Boleto' : 'Cartão'}
            </Button>
          ))}
        </div>
      </div>

      <Button className="w-full gap-2" size="lg" disabled={loading} onClick={onSubmit}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Ativar com pagamento agora
      </Button>

      {pixCopyPaste ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
          <p className="font-medium text-primary mb-1">PIX copia e cola</p>
          <p className="break-all text-muted-foreground">{pixCopyPaste}</p>
        </div>
      ) : null}

      {invoiceUrl ? (
        <Button variant="outline" className="w-full" asChild>
          <a href={invoiceUrl} target="_blank" rel="noreferrer">
            Abrir fatura segura
          </a>
        </Button>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        Ativação operacional — workspace liberado após confirmação.
      </p>

      <ActivationBadge variant="ai">Próximo passo: onboarding do workspace</ActivationBadge>
    </div>
  );
}
