import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type MobileCommerceScreenLayoutProps = {
  /** Quando true, aplica shell fullscreen (mobile). Em desktop não altera o layout. */
  enabled: boolean;
  /** Barra superior fixa (voltar, título, etc.) — ignorado quando `enabled` é false. */
  header?: React.ReactNode;
  /** Área rolável principal */
  children: React.ReactNode;
  /** Rodapé fixo opcional (CTA principal) */
  footer?: React.ReactNode;
  className?: string;
  /**
   * Quando true (defeito com `enabled`), renderiza em `document.body` com `fixed inset-0`
   * para fluxo app real acima do layout principal (padding, sidebar, tab bar).
   */
  usePortal?: boolean;
};

/**
 * Shell tipo app para fluxos comerciais no mobile: header + scroll + footer com safe area.
 * Em desktop (`enabled === false`) renderiza apenas os children (header/footer ficam a cargo da página).
 */
export function MobileCommerceScreenLayout({
  enabled,
  header,
  children,
  footer,
  className,
  usePortal = true,
}: MobileCommerceScreenLayoutProps) {
  React.useEffect(() => {
    if (!enabled || !usePortal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [enabled, usePortal]);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  const shell = (
    <div
      className={cn(
        "flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-background",
        "pt-[env(safe-area-inset-top,0px)]",
        usePortal && "fixed inset-0 z-[200]",
        className,
      )}
    >
      {header ? (
        <header className="shrink-0 border-b border-border bg-background/98 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/90">
          {header}
        </header>
      ) : null}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2",
          footer
            ? "pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))]"
            : "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
        )}
      >
        {children}
      </div>
      {footer ? (
        <div
          className={cn(
            "shrink-0 border-t border-border bg-background/98 shadow-[0_-6px_24px_rgba(0,0,0,0.08)] backdrop-blur-md",
            "px-3 pt-3",
            "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] dark:shadow-[0_-6px_24px_rgba(0,0,0,0.35)]",
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );

  if (usePortal && typeof document !== "undefined") {
    return createPortal(shell, document.body);
  }

  return shell;
}
