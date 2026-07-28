import { Link } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type Billing2PlaceholderProps = {
  title: string;
  description: string;
  /** Sprint do Implementation Plan onde a tela será entregue */
  plannedSprint: number;
  /** Caminho opcional para feature flags (já disponível na Sprint 0) */
  relatedHref?: string;
  relatedLabel?: string;
};

/**
 * Placeholder seguro Billing 2.0 (Sprint 0).
 * Rotas no hub sem quebrar navegação; sem funcionalidade de cobrança.
 */
export function SuperAdminBilling2Placeholder({
  title,
  description,
  plannedSprint,
  relatedHref = "/superadmin/billing/feature-flags",
  relatedLabel = "Ver Feature Flags (Sprint 0)",
}: Billing2PlaceholderProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/superadmin/financeiro">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Financeiro
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-muted">
            <Construction className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Esta área faz parte do <strong className="text-foreground">Billing 2.0</strong> e será
            implementada na <strong className="text-foreground">Sprint {plannedSprint}</strong> do
            plano de implantação. Nenhuma cobrança ou renovação foi alterada nesta Sprint 0.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={relatedHref}>{relatedLabel}</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/superadmin/billing/operations">Operações billing</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SuperAdminBilling2ComingSoonPage() {
  return (
    <SuperAdminBilling2Placeholder
      title="Billing 2.0"
      description="Módulo em preparação."
      plannedSprint={1}
    />
  );
}
