import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CONTACT_CTA } from './contactSetupConstants';

type Props = {
  onContinue: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  subtitle?: string;
};

export function ContactDesktopFooter({
  onContinue,
  loading,
  disabled,
  label = CONTACT_CTA.label,
  subtitle = CONTACT_CTA.subtitle,
}: Props) {
  return (
    <footer
      className={cn(
        'mt-1 w-full shrink-0 border-t border-white/[0.07]',
        'bg-[hsl(228,30%,6%)]/80 px-1 py-4 backdrop-blur-xl',
        'shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.45)]',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={onContinue}
          className={cn(
            'group inline-flex h-[52px] w-full shrink-0 items-center justify-center gap-2 rounded-[16px] px-8 sm:w-auto',
            'bg-primary text-[15px] font-semibold text-primary-foreground',
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

export function ContactDesktopBackRow({ onBack }: { onBack?: () => void }) {
  if (!onBack) return null;
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar
    </button>
  );
}
