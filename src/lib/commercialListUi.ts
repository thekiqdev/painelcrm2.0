/** Cartões-resumo clicáveis (alinhado a Faturas / Propostas). */
export const COMMERCIAL_SUMMARY_ACTIVE_RING =
  "ring-2 ring-crm-primary/50 border-crm-primary/35 bg-crm-primary/[0.06]";

/** Base visual comum aos cards de métricas das listagens comerciais. */
export const COMMERCIAL_SUMMARY_CARD_CLASS =
  "cursor-pointer border shadow-sm transition-all hover:bg-muted/40";

/**
 * Shell exterior oficial das páginas de listagem (largura + ritmo vertical).
 * O padding horizontal fica a cargo do `AppLayout` / `main`.
 */
export const COMMERCIAL_LIST_PAGE_OUTER = "mx-auto w-full max-w-7xl space-y-6 pb-4 md:pb-6";

/** Grelha padrão 4 métricas (ex.: faturas, propostas). */
export const COMMERCIAL_SUMMARY_GRID_4 = "grid grid-cols-2 gap-3 lg:grid-cols-4";

/** Grelha padrão 3 métricas (ex.: clientes). */
export const COMMERCIAL_SUMMARY_GRID_3 = "grid grid-cols-2 gap-3 sm:grid-cols-3";

/** Grelha 6 métricas (funil de leads). */
export const COMMERCIAL_SUMMARY_GRID_6 = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6";

/** Contêiner da tabela em desktop (lista comercial). */
export const COMMERCIAL_TABLE_DESKTOP_WRAP =
  "hidden overflow-hidden rounded-lg border border-border/60 bg-card md:block";

/** Painel de filtros / funil no desktop. */
export const COMMERCIAL_FILTERS_PANEL =
  "rounded-lg border border-border/60 bg-muted/15 p-3 md:p-4";

/** Card único que envolve título da lista + subtítulo + conteúdo (clientes, leads). */
export const COMMERCIAL_LIST_CONTAINER_CARD = "border-border/80 shadow-sm";
