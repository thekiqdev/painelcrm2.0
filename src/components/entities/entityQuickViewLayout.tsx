import type { ComponentType, ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ExternalLink, UserRound } from "lucide-react";

export const ENTITY_QUICK_VIEW_PAD = "px-4 sm:px-5";
export const ENTITY_QUICK_VIEW_GAP = "gap-3";
export const ENTITY_QUICK_VIEW_SECTION = "border-b border-border/40 pb-3";

export type EntityQuickViewKind = "client" | "lead";

export function EntityQuickViewShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}

export function getEntityInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const kindBadgeClass: Record<EntityQuickViewKind, string> = {
  client: "border-blue-500/30 bg-blue-500/12 text-blue-700 dark:text-blue-300",
  lead: "border-violet-500/30 bg-violet-500/12 text-violet-700 dark:text-violet-300",
};

const kindLabel: Record<EntityQuickViewKind, string> = {
  client: "Cliente",
  lead: "Lead",
};

export function EntityQuickViewHeader({
  avatarUrl,
  displayName,
  entityKind,
  status,
  phoneLine,
}: {
  avatarUrl?: string | null;
  displayName: string;
  entityKind: EntityQuickViewKind;
  status?: string | null;
  /** Telefone formatado abaixo do nome (evita repetir no resumo). */
  phoneLine?: string | null;
}) {
  const initials = getEntityInitials(displayName) || "?";

  return (
    <header
      className={cn(
        "shrink-0 border-b border-border/60 bg-gradient-to-b from-muted/30 to-transparent pb-4 pt-3",
        ENTITY_QUICK_VIEW_PAD,
      )}
    >
      <div className="flex items-start gap-3 pr-8">
        <Avatar className="h-11 w-11 shrink-0 border border-border/70 shadow-sm ring-2 ring-background">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-snug tracking-tight text-foreground sm:text-[1.05rem]">
            {displayName}
          </h2>
          {phoneLine ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{phoneLine}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn("h-5 border px-2 text-[10px] font-medium", kindBadgeClass[entityKind])}
            >
              {kindLabel[entityKind]}
            </Badge>
            {status ? (
              <Badge variant="secondary" className="h-5 px-2 text-[10px] font-normal">
                {status}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export type SummaryRow = { label: string; value: ReactNode };

export function EntityQuickViewSummary({ rows }: { rows: SummaryRow[] }) {
  const visible = rows.filter((r) => r.value != null && r.value !== "");
  if (visible.length === 0) return null;

  return (
    <section className={cn(ENTITY_QUICK_VIEW_PAD, "pb-4 pt-4")}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Resumo
      </p>
      <div className="grid gap-3 rounded-xl border border-border/50 bg-card/50 p-3 shadow-sm">
        {visible.map((row) => (
          <div key={row.label} className="min-w-0">
            <p className="text-xs text-muted-foreground">{row.label}</p>
            <div className="mt-0.5 text-sm font-medium leading-snug text-foreground">{row.value}</div>
          </div>
        ))}
      </div>
      {/* Future: Timeline */}
      {/* Future: Tabs */}
    </section>
  );
}

export function EntityQuickViewPrimaryRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

export function EntityQuickViewProfileButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-10 w-full gap-2 border border-border bg-background font-medium shadow-none",
        "transition-colors hover:bg-muted",
        className,
      )}
      onClick={onClick}
    >
      <UserRound className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
      <span className="flex-1 text-left">{label}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
    </Button>
  );
}

export type EntityQuickActionItem = {
  label: string;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  emphasized?: boolean;
};

export function EntityQuickViewQuickActions({ items }: { items: EntityQuickActionItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className={cn(ENTITY_QUICK_VIEW_SECTION, ENTITY_QUICK_VIEW_PAD)}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Ações rápidas</p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.label}
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-9 justify-start gap-2 px-2.5 font-normal",
                item.emphasized &&
                  "border-primary/45 bg-primary/5 shadow-sm ring-1 ring-primary/20",
              )}
              onClick={item.onClick}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

export function EntityQuickViewPrimaryActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(ENTITY_QUICK_VIEW_SECTION, ENTITY_QUICK_VIEW_PAD, "space-y-2", className)}>
      {children}
    </section>
  );
}

export function EntityQuickViewScrollBody({ children }: { children: ReactNode }) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", ENTITY_QUICK_VIEW_GAP)}>
      {children}
    </div>
  );
}

export function EntityQuickViewSkeleton() {
  return (
    <EntityQuickViewShell>
      <div className={cn("border-b border-border/60 pb-4 pt-3", ENTITY_QUICK_VIEW_PAD)}>
        <div className="flex items-start gap-3 pr-8">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4 max-w-[200px]" />
            <Skeleton className="h-3 w-1/2 max-w-[120px]" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      <div className={cn("flex-1 py-4", ENTITY_QUICK_VIEW_PAD)}>
        <Skeleton className="mb-3 h-3 w-16" />
        <div className="space-y-3 rounded-xl border border-border/50 p-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-[80%]" />
        </div>
      </div>
      <div className={cn("space-y-2 border-t border-border/60 py-4", ENTITY_QUICK_VIEW_PAD)}>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </EntityQuickViewShell>
  );
}

export function formatQuickViewDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return null;
  }
}
