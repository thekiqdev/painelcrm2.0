import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
  loading?: boolean;
  className?: string;
};

export function StatCard({ label, value, icon: Icon, iconClassName, loading, className }: Props) {
  if (loading) {
    return <Skeleton className={cn("h-[72px] rounded-xl", className)} />;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-muted/25 px-2.5 py-2 shadow-sm dark:bg-muted/15",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 shadow-sm",
            iconClassName,
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
        </div>
        <span className="min-w-0 flex-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
