import { cn } from "@/lib/utils";

/** Cards de gateway alinhados no grid (mesma altura mínima e borda). */
export function gatewayCardClassName(extra?: string): string {
  return cn(
    "flex h-full min-h-[380px] flex-col overflow-hidden border border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md",
    extra
  );
}

/** Topo do card: logo + coluna (nome + status abaixo), alinhado à esquerda. */
export const gatewayCardIdentityRowClass = "flex items-start gap-2.5";
/** Coluna do título + badge secundário (espaçamento 4px entre linhas). */
export const gatewayCardTitleStackClass = "flex min-w-0 flex-1 flex-col gap-1";
export const gatewayCardStatusSectionClass =
  "grid grid-cols-1 gap-2.5 rounded-lg bg-muted/40 px-2.5 py-2.5 sm:grid-cols-3 sm:gap-3";
/** Corpo: cresce; ações usam `gatewayCardActionsRowClass` com `mt-auto`. */
export const gatewayCardBodyClass = "flex min-h-0 flex-1 flex-col border-t border-border/60 pt-3";
/** Rodapé com botões colado na base do card quando há espaço extra. */
export const gatewayCardActionsRowClass = "mt-auto flex flex-wrap gap-2 border-t border-border/45 pt-3";
