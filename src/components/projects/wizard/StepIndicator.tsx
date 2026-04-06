import React from "react";
import { cn } from "@/lib/utils";
import { WIZARD_STEP_LABELS } from "./types";

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  className?: string;
}

export function StepIndicator({ currentStep, className }: StepIndicatorProps) {
  const steps: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

  return (
    <nav aria-label="Progresso do wizard" className={cn("w-full", className)}>
      <ol className="flex items-center justify-between gap-2">
        {steps.map((step, index) => {
          const isCurrent = step === currentStep;
          const isPast = step < currentStep;
          return (
            <li
              key={step}
              className={cn(
                "flex flex-1 items-center",
                index < steps.length - 1 && "after:content-[''] after:flex-1 after:border-b after:border-muted-foreground/30 after:mx-2"
              )}
            >
              <div
                className={cn(
                  "flex flex-col items-center gap-1 min-w-0",
                  isPast && "opacity-90",
                  isCurrent && "font-medium"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm transition-colors",
                    isCurrent && "border-crm-primary bg-crm-primary text-primary-foreground",
                    isPast && "border-crm-primary bg-crm-primary/20 text-crm-primary",
                    !isCurrent && !isPast && "border-muted-foreground/40 bg-muted/50 text-muted-foreground"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {step}
                </span>
                <span
                  className={cn(
                    "hidden text-xs sm:inline-block text-center truncate max-w-[80px]",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {WIZARD_STEP_LABELS[step]}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        Etapa {currentStep} de 4: {WIZARD_STEP_LABELS[currentStep]}
      </p>
    </nav>
  );
}
