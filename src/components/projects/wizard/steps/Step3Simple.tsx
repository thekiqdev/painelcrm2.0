import React from "react";
import { CheckCircle2 } from "lucide-react";

export function Step3Simple() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 py-12 text-center">
      <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-3" />
      <p className="font-medium text-muted-foreground">Nada a configurar</p>
      <p className="mt-1 text-sm text-muted-foreground">
        O projeto simples usa o fluxo padrão. Clique em Continuar para revisar.
      </p>
    </div>
  );
}
