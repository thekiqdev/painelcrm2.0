import React from "react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFinanceMobileChrome } from "@/contexts/FinanceMobileChromeContext";
import { useMobileKeyboardOverlap } from "@/hooks/useMobileKeyboardOverlap";
import { lightHaptic } from "@/lib/haptics";
import type { LucideIcon } from "lucide-react";

export type FinanceMobileBottomAction = {
  key: string;
  label: string;
  onClick: () => void;
  /** success=verde, danger=vermelho, primary=destaque azul/sistema, outline=secundário */
  variant: "success" | "danger" | "primary" | "outline";
  icon?: LucideIcon;
  /** número para badge (ex.: contas urgentes) */
  badge?: number;
  loading?: boolean;
};

const variantClass: Record<FinanceMobileBottomAction["variant"], string> = {
  success:
    "border-emerald-600/40 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700",
  danger:
    "border-rose-600/40 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700",
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  outline: "border border-border bg-background/90 text-foreground hover:bg-muted/80 dark:bg-background/80",
};

/**
 * Barra fixa acima da tab bar do app (mobile). Desktop: não renderiza.
 * Respeita safe-area inferior e esconde com modais (`useFinanceBottomBarVisibility`) ou teclado.
 */
export function FinanceMobileBottomBar({
  actions,
  className,
}: {
  actions: FinanceMobileBottomAction[];
  className?: string;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { suppressBottomBar } = useFinanceMobileChrome();
  const keyboardLikely = useMobileKeyboardOverlap();

  if (isDesktop || actions.length === 0) return null;
  if (suppressBottomBar || keyboardLikely) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[38] md:hidden",
        /** Acima da tab bar principal do app */
        "bottom-[calc(4rem+env(safe-area-inset-bottom))]"
      )}
      aria-hidden={false}
    >
      <div
        className={cn(
          "pointer-events-auto mx-auto flex max-w-lg gap-2 px-3 pb-3 pt-2",
          "border-t border-border/60 bg-background/85 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.15)] backdrop-blur-md supports-[backdrop-filter]:bg-background/75",
          "rounded-t-2xl",
          className
        )}
        role="toolbar"
        aria-label="Acções rápidas"
      >
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              type="button"
              disabled={a.loading}
              onClick={() => {
                lightHaptic();
                a.onClick();
              }}
              className={cn(
                "relative flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-medium transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60",
                variantClass[a.variant]
              )}
            >
              {Icon ? <Icon className="h-5 w-5 shrink-0 opacity-95" aria-hidden /> : null}
              <span className="truncate">{a.loading ? "…" : a.label}</span>
              {a.badge != null && a.badge > 0 ? (
                <span className="absolute -right-0.5 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground tabular-nums shadow-sm">
                  {a.badge > 99 ? "99+" : a.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Espaço extra no fundo da página para a barra de acções + tab bar (só mobile). */
export const financeMobilePageBottomPad = "max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom))]";
