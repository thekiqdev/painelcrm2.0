import { useMemo } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function readDomDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Alternância claro/escuro (next-themes): chave + ícones sol/lua.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = useMemo(() => {
    if (resolvedTheme === "dark") return true;
    if (resolvedTheme === "light") return false;
    return readDomDark();
  }, [resolvedTheme]);

  const tooltip = isDark
    ? "Modo escuro. Clique para modo claro."
    : "Modo claro. Clique para modo escuro.";

  const ariaLabel = isDark
    ? "Tema escuro ativo. Alternar para claro."
    : "Tema claro ativo. Alternar para escuro.";

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-1.5 py-1 shadow-sm backdrop-blur-sm sm:gap-2 sm:px-2",
            className
          )}
        >
          <Sun
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors sm:h-4 sm:w-4",
              !isDark
                ? "text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.75)]"
                : "text-muted-foreground/60"
            )}
            aria-hidden
          />

          <Switch
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            aria-label={ariaLabel}
            className="shrink-0 scale-90 data-[state=checked]:bg-primary/90 data-[state=unchecked]:bg-input sm:scale-100"
          />

          <Moon
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors sm:h-4 sm:w-4",
              isDark ? "text-primary" : "text-muted-foreground/60"
            )}
            aria-hidden
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-[240px] text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
