import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SuperAdminHubCardDef } from "@/layouts/superadminHubConfig";

type SuperAdminAreaHubProps = {
  title: string;
  description: string;
  cards: SuperAdminHubCardDef[];
};

export function SuperAdminAreaHub({ title, description, cards }: SuperAdminAreaHubProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.to} className="flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md">
              <CardHeader className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-crm-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <CardTitle className="text-lg leading-snug">{card.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">{card.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                <Button asChild className="w-full sm:w-auto">
                  <Link to={card.to}>Abrir</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
