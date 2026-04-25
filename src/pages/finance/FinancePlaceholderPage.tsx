import React from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const titles: Record<string, string> = {
  cartoes: "Cartões de crédito",
  relatorios: "Relatórios",
};

const FinancePlaceholderPage = () => {
  const seg = useLocation().pathname.split("/").pop() || "";
  const title = titles[seg] ?? "Em breve";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Planejado para fases seguintes do módulo financeiro.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Consulte <code className="text-xs bg-muted px-1 rounded">docs/MODULO_FINANCEIRO_PROFISSIONAL.md</code> para o
        roadmap (Fases 2–4).
      </CardContent>
    </Card>
  );
};

export default FinancePlaceholderPage;
