import React from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SettingsBackHeaderProps = {
  backLabel?: string;
  title: string;
  onBack: () => void;
  className?: string;
};

export function SettingsBackHeader({
  backLabel = "Configurações",
  title,
  onBack,
  className,
}: SettingsBackHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-border/80 bg-background/95 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] backdrop-blur-sm",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 rounded-full"
        onClick={onBack}
        aria-label={`Voltar para ${backLabel}`}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{backLabel}</p>
        <h1 className="truncate text-lg font-semibold leading-tight text-foreground">{title}</h1>
      </div>
    </header>
  );
}
