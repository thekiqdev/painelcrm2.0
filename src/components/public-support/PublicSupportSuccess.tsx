import { useMemo } from "react";
import { ArrowLeft, CheckCircle2, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portalAccent, companyInitials, textOnAccent } from "./supportBranding";
import type { PublicPortalPayload, TicketPostOk } from "./types";

type Props = {
  portal: PublicPortalPayload;
  accent: string;
  done: TicketPostOk;
  onNewTicket: () => void;
  onBackToStart: () => void;
};

export function PublicSupportSuccess({ portal, accent, done, onNewTicket, onBackToStart }: Props) {
  const a = portalAccent(portal.primary_color, accent);
  const fg = textOnAccent(a);
  const company = portal.company_name?.trim() || "Empresa";

  const pageStyle = useMemo(
    () =>
      ({
        ["--support-accent" as string]: a,
      }) as React.CSSProperties,
    [a],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40" style={pageStyle}>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/90">
        <div className="mx-auto flex h-[52px] max-w-[1600px] items-center px-4 sm:px-6 lg:px-8">
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">Central de suporte</span>
          <span className="ml-2 truncate text-xs text-muted-foreground sm:text-sm">{company}</span>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-lg">
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] sm:p-1">
            <div className="p-7 sm:p-9">
              <div className="flex flex-col items-center text-center">
                {portal.logo_url ? (
                  <img
                    src={portal.logo_url}
                    alt={company}
                    className="mb-5 h-11 w-auto max-w-[180px] object-contain"
                  />
                ) : (
                  <div
                    className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg text-sm font-semibold text-white shadow-sm"
                    style={{ backgroundColor: a }}
                  >
                    {companyInitials(company)}
                  </div>
                )}

                <div
                  className="mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full shadow-inner ring-4 ring-muted/50"
                  style={{ backgroundColor: `${a}14` }}
                >
                  <CheckCircle2 className="h-10 w-10" style={{ color: a }} strokeWidth={2} aria-hidden />
                </div>

                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  Chamado enviado com sucesso
                </h1>

                {done.ticket_number ? (
                  <p className="mt-4 font-mono text-base font-semibold tracking-tight text-foreground sm:text-lg">
                    Protocolo: <span style={{ color: a }}>{done.ticket_number}</span>
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">{done.message ?? "Obrigado pelo contacto."}</p>
                )}

                <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  A nossa equipa recebeu a sua solicitação e entrará em contacto pelo telefone ou e-mail informado.
                </p>

                <div className="mt-9 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-11 flex-1 rounded-lg border-border/80 sm:flex-initial sm:min-w-[160px]"
                    onClick={onBackToStart}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para o início
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="h-11 flex-1 rounded-lg font-semibold shadow-md sm:flex-initial sm:min-w-[180px]"
                    style={{ backgroundColor: a, color: fg }}
                    onClick={onNewTicket}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Abrir novo chamado
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
