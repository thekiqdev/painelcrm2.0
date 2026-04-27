import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import type { MobilePagePrimaryAction, MobilePageSecondaryAction } from "@/components/mobile/MobilePageHeader";

export type { MobilePagePrimaryAction, MobilePageSecondaryAction };

export type CommercialListingPageHeaderProps = {
  /** Texto curto acima do título (ex.: «Base comercial»). — apenas desktop */
  eyebrow: string;
  /** Ícone opcional à esquerda do eyebrow. — apenas desktop */
  EyebrowIcon?: LucideIcon;
  title: string;
  /** Descrição — apenas desktop */
  description: string;
  /** Ações à direita da primeira linha (CTAs, menus). — apenas desktop */
  titleActions?: React.ReactNode;
  /** Linha completa abaixo do título: busca + gatilhos móveis, etc. */
  belowTitle?: React.ReactNode;
  className?: string;
  /** Header compacto mobile (estilo app). */
  mobileSecondaryActions?: MobilePageSecondaryAction[];
  mobilePrimaryAction?: MobilePagePrimaryAction;
  mobileSecondarySlot?: React.ReactNode;
  /** Ex.: botão voltar no mobile. */
  mobileLeading?: React.ReactNode;
};

/**
 * Cabeçalho oficial das listagens comerciais — desktop com eyebrow + descrição;
 * mobile com `MobilePageHeader` fixo no topo (sem subtítulo).
 */
export function CommercialListingPageHeader({
  eyebrow,
  EyebrowIcon,
  title,
  description,
  titleActions,
  belowTitle,
  className,
  mobileSecondaryActions,
  mobilePrimaryAction,
  mobileSecondarySlot,
  mobileLeading,
}: CommercialListingPageHeaderProps) {
  return (
    <header className={cn("space-y-3 md:space-y-4", className)}>
      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title={title}
          leading={mobileLeading}
          secondaryActions={mobileSecondaryActions}
          secondarySlot={mobileSecondarySlot}
          primaryAction={mobilePrimaryAction}
        />
      </div>

      <div className="hidden md:block space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              {EyebrowIcon ? <EyebrowIcon className="h-4 w-4 shrink-0 opacity-90" aria-hidden /> : null}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary/90">{eyebrow}</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:max-w-2xl">{description}</p>
          </div>
          {titleActions ? (
            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
              {titleActions}
            </div>
          ) : null}
        </div>
      </div>
      {belowTitle ? <div className="min-w-0">{belowTitle}</div> : null}
    </header>
  );
}
