import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  variant: "invalid" | "portal";
};

const copy: Record<Props["variant"], { title: string; description: string }> = {
  invalid: {
    title: "Link inválido",
    description: "Este endereço não corresponde a um portal de suporte.",
  },
  portal: {
    title: "Portal não encontrado",
    description: "Verifique o link informado ou entre em contacto com a empresa.",
  },
};

export function PublicSupportNotFound({ variant }: Props) {
  const { title, description } = copy[variant];
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-16 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <Card className="w-full max-w-md rounded-2xl border-border/60 bg-card/95 shadow-sm backdrop-blur-sm">
        <CardHeader className="space-y-3 pb-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <HelpCircle className="h-7 w-7 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
          <CardDescription className="text-base leading-relaxed">{description}</CardDescription>
        </CardHeader>
        <CardContent className="pb-8 text-center text-sm text-muted-foreground">
          Se precisar de ajuda, peça à empresa o endereço correcto do suporte.
        </CardContent>
      </Card>
    </div>
  );
}
