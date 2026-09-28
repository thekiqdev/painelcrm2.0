import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const GatewayFeatureList: React.FC<{
  items: string[];
  className?: string;
  /** Texto após a lista, ex.: "+ N recursos" */
  footerHint?: string;
}> = ({ items, className, footerHint }) => (
  <ul className={cn("space-y-1.5 text-sm text-foreground", className)}>
    {items.map((line) => (
      <li key={line} className="flex gap-2">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span>{line}</span>
      </li>
    ))}
    {footerHint ? <li className="pl-6 text-xs text-muted-foreground">{footerHint}</li> : null}
  </ul>
);
