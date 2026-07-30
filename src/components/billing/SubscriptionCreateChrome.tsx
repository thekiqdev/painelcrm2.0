import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  { n: 1, label: "Identificação" },
  { n: 2, label: "Itens" },
  { n: 3, label: "Configuração" },
  { n: 4, label: "Revisão" },
] as const;

export function SubscriptionCreateSteps({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Etapas da criação"
      className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)}
    >
      {STEPS.map((step, i) => (
        <div key={step.n} className="flex items-center gap-2 sm:gap-3">
          {i > 0 ? (
            <span className="hidden h-px w-4 bg-border sm:block" aria-hidden />
          ) : null}
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {step.n}
            </span>
            <span className="text-sm font-medium text-foreground/90">{step.label}</span>
          </div>
        </div>
      ))}
    </nav>
  );
}

export type SubscriptionSummaryProps = {
  clientLabel: string;
  description: string;
  amountLabel: string;
  intervalLabel: string;
  dueDateLabel: string;
  methodsLabel: string;
  cyclesLabel: string;
  className?: string;
};

export function SubscriptionSummaryCard({
  clientLabel,
  description,
  amountLabel,
  intervalLabel,
  dueDateLabel,
  methodsLabel,
  cyclesLabel,
  className,
}: SubscriptionSummaryProps) {
  const rows: Array<{ label: string; value: string; emphasize?: boolean }> = [
    { label: "Cliente", value: clientLabel || "—" },
    { label: "Descrição", value: description || "—" },
    { label: "Valor", value: amountLabel, emphasize: true },
    { label: "Periodicidade", value: intervalLabel, emphasize: true },
    { label: "1º vencimento", value: dueDateLabel || "—", emphasize: true },
    { label: "Ciclos", value: cyclesLabel },
    { label: "Métodos", value: methodsLabel || "—" },
  ];

  return (
    <Card className={cn("border-border/80 shadow-sm", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold tracking-tight">
          Resumo da assinatura
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-0.5 border-b border-border/50 pb-2.5 last:border-0 last:pb-0"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {row.label}
            </span>
            <span
              className={cn(
                "text-sm break-words",
                row.emphasize ? "text-base font-semibold text-foreground" : "text-foreground/90",
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SubscriptionSectionCard({
  step,
  title,
  description,
  children,
  className,
}: {
  step?: number;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <header className="space-y-1">
        <div className="flex items-center gap-2.5">
          {step != null ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
              {step}
            </span>
          ) : null}
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        </div>
        {description ? (
          <p className={cn("text-sm text-muted-foreground", step != null && "pl-[1.875rem]")}>
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
