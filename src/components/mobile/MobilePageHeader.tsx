import * as React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MobilePageSecondaryAction = {
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
};

export type MobilePagePrimaryAction = {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** Obrigatório quando só há ícone (acessibilidade). */
  ariaLabel?: string;
};

export type MobilePageHeaderProps = {
  title: string;
  primaryAction?: MobilePagePrimaryAction;
  secondaryActions?: MobilePageSecondaryAction[];
  /** Conteúdo extra entre ícones secundários e o CTA (ex.: menu dropdown). */
  secondarySlot?: React.ReactNode;
  /** Ex.: botão voltar à esquerda do título. */
  leading?: React.ReactNode;
  className?: string;
};

function PrimaryButton({ action }: { action: MobilePagePrimaryAction }) {
  const iconOnly = !action.label?.trim();
  const a11yLabel = action.ariaLabel ?? (iconOnly ? undefined : action.label);
  const content = (
    <>
      {action.icon ? <span className={cn(iconOnly ? "" : "shrink-0 [&_svg]:h-4 [&_svg]:w-4")}>{action.icon}</span> : null}
      {action.label ? <span className="truncate">{action.label}</span> : null}
    </>
  );

  const baseClass = cn(
    "shrink-0 touch-manipulation active:scale-[0.98] motion-safe:transition-transform motion-reduce:transition-none",
    iconOnly ? "h-10 w-10 rounded-md p-0" : "h-10 max-w-[min(100%,11rem)] gap-1.5 px-3 text-sm font-semibold",
  );

  if (action.href && !action.disabled) {
    return (
      <Button asChild size={iconOnly ? "icon" : "default"} className={baseClass}>
        <Link
          to={action.href}
          className="inline-flex items-center justify-center gap-1.5"
          aria-label={a11yLabel}
        >
          {content}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={iconOnly ? "icon" : "default"}
      className={baseClass}
      disabled={action.disabled}
      onClick={action.onClick}
      aria-label={a11yLabel}
    >
      {content}
    </Button>
  );
}

/**
 * Cabeçalho compacto padrão para listagens no mobile (estilo app).
 * Desktop: usar bloco próprio oculto com `md:hidden` / `hidden md:*`.
 */
export function MobilePageHeader({
  title,
  primaryAction,
  secondaryActions = [],
  secondarySlot,
  leading,
  className,
}: MobilePageHeaderProps) {
  const icons = secondaryActions.slice(0, 3);

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none",
        className,
      )}
    >
      <div className="flex min-h-11 items-center gap-2">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        <div className="flex shrink-0 items-center gap-0.5">
          {icons.map((a, i) => (
            <Button
              key={i}
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 touch-manipulation text-muted-foreground hover:text-foreground active:scale-95 motion-safe:transition-transform motion-reduce:transition-none"
              aria-label={a.ariaLabel}
              onClick={a.onClick}
            >
              {a.icon}
            </Button>
          ))}
          {secondarySlot ? <div className="flex shrink-0 items-center">{secondarySlot}</div> : null}
          {primaryAction ? <PrimaryButton action={primaryAction} /> : null}
        </div>
      </div>
    </div>
  );
}
