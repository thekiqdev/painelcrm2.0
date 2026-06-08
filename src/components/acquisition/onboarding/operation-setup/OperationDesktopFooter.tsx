import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OperationPreviewState } from './operationBuilderState';

type Props = {
  preview: OperationPreviewState;
  onBack: () => void;
  onContinue: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
};

/** Barra operacional — largura da coluna de configuração apenas */
export function OperationDesktopFooter({
  preview,
  onBack,
  onContinue,
  loading,
  disabled,
  label = 'Continuar ativação',
}: Props) {
  const trialShort = preview.trialLabel?.replace(' para explorar', '') ?? null;

  return (
    <footer
      className={cn(
        'mt-1 w-full shrink-0',
        'border-t border-white/[0.07]',
        'bg-[hsl(228,30%,6%)]/80 px-6 py-4 backdrop-blur-xl',
        'shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.45)]',
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {trialShort ? (
          <span className="font-medium text-primary/90">{trialShort} grátis</span>
        ) : null}
        <span>
          <span className="font-medium tabular-nums text-foreground">{preview.usersCount}</span>{' '}
          {preview.usersCount === 1 ? 'usuário' : 'usuários'}
        </span>
        <span>
          <span className="font-medium text-emerald-400/90">{preview.whatsappChannels}</span> canal WhatsApp
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={onContinue}
          className={cn(
            'group inline-flex h-[58px] items-center justify-center gap-2 rounded-[18px] px-8',
            'bg-primary text-base font-semibold text-primary-foreground',
            'shadow-[0_0_40px_-10px_hsl(var(--primary)/0.6)]',
            'transition-all duration-300 hover:shadow-[0_0_52px_-8px_hsl(var(--primary)/0.7)]',
            'active:scale-[0.99] disabled:opacity-50',
          )}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {label}
          {!loading ? (
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          ) : null}
        </button>
      </div>
    </footer>
  );
}
