import { cn } from '@/lib/utils';
import { activationPrimaryButtonClass } from './activationAppStyles';
import { formatOnboardingActivationPrice } from './onboardingPricing';
import { OnboardingPaymentPanel } from './OnboardingPaymentPanel';
import type { PublicAcquisitionPlan } from './types';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';

type TrialProps = {
  mode: 'trial';
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  plan: PublicAcquisitionPlan | null;
  usersCount: number;
  trialDays: number;
  loading: boolean;
  onStartTrial: () => void;
};

type PaymentProps = {
  mode: 'payment';
  leadName: string;
  leadEmail: string;
  plan: PublicAcquisitionPlan;
  usersCount: number;
  loading: boolean;
  cpfCnpj: string;
  paymentMethod: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
  onCpfCnpjChange: (v: string) => void;
  onPaymentMethodChange: (m: 'PIX' | 'BOLETO' | 'CREDIT_CARD') => void;
  onSubmitPayment: () => void;
  pixCopyPaste?: string | null;
  invoiceUrl?: string | null;
};

export type OnboardingConversionStepProps = TrialProps | PaymentProps;

export function OnboardingConversionStep(props: OnboardingConversionStepProps) {
  if (props.mode === 'payment') {
    return <OnboardingPaymentPanel {...props} />;
  }

  const { leadName, leadPhone, leadEmail, plan, trialDays, loading, onStartTrial } = props;
  const priceLabel = plan ? formatOnboardingActivationPrice(plan, props.usersCount) : null;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 space-y-2.5 text-sm backdrop-blur-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Contato</span>
          <span className="truncate font-medium">{leadName}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">WhatsApp</span>
          <span className="truncate tabular-nums">{leadPhone}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">E-mail</span>
          <span className="truncate">{leadEmail}</span>
        </div>
        {plan ? (
          <>
            <div className="border-t border-white/5 pt-2.5 flex justify-between gap-2">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-medium">{plan.name}</span>
            </div>
            {priceLabel ? (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Após avaliação</span>
                <span className="font-semibold tabular-nums">{priceLabel}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Inicie a avaliação com os dados de contato já informados. Empresa e operação entram no onboarding.
      </p>

      <button
        type="button"
        disabled={loading || !plan}
        onClick={onStartTrial}
        className={cn(activationPrimaryButtonClass, 'h-auto flex-col items-stretch gap-0 rounded-2xl px-5 py-4')}
      >
        <div className="flex w-full items-start justify-between gap-3 text-left">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4" />
              Iniciar avaliação
            </p>
            <p className="mt-1.5 text-sm text-primary-foreground/80">
              {trialDays} {trialDays === 1 ? 'dia' : 'dias'} para explorar o workspace. Sem pagamento agora.
            </p>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
          ) : (
            <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
          )}
        </div>
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Próximo passo: onboarding operacional — empresa, equipe e WhatsApp.
      </p>
    </div>
  );
}
