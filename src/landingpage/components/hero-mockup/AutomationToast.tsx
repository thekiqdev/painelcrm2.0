import { Sparkles, Zap } from "lucide-react";

type AutomationToastProps = {
  visible: boolean;
  variant?: "automation" | "finance" | "success";
  children: React.ReactNode;
  className?: string;
};

export function AutomationToast({
  visible,
  variant = "automation",
  children,
  className = "",
}: AutomationToastProps) {
  if (!visible) return null;
  const Icon = variant === "finance" ? Zap : variant === "success" ? Sparkles : Sparkles;
  const ring =
    variant === "finance"
      ? "border-emerald-500/40 bg-emerald-950/80 text-emerald-50"
      : variant === "success"
        ? "border-violet-500/40 bg-violet-950/85 text-violet-50"
        : "border-cyan-500/35 bg-[hsl(222_44%_12%/0.92)] text-foreground";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md ${ring} hero-mockup-toast-enter ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
      {children}
    </div>
  );
}
