import { Button } from "@/components/ui/button";
import { normalizeBrazilianNationalDigits } from "@/lib/phone";
import { EntityQuickViewSkeleton } from "./entityQuickViewLayout";

export function QuickViewLoading() {
  return <EntityQuickViewSkeleton />;
}

export function QuickViewError({
  message,
  onRetry,
  onOpenFull,
  fullLabel,
}: {
  message: string;
  onRetry?: () => void;
  onOpenFull?: () => void;
  fullLabel: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : null}
        {onOpenFull ? (
          <Button type="button" size="sm" onClick={onOpenFull}>
            {fullLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function buildWhatsAppHref(phone?: string | null, whatsapp?: string | null): string | null {
  const raw = (whatsapp || phone || "").trim();
  if (!raw) return null;
  const digits = normalizeBrazilianNationalDigits(raw);
  if (digits.length < 10) return null;
  return `https://wa.me/55${digits}`;
}
