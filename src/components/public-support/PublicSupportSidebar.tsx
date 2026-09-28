import { cn } from "@/lib/utils";
import { portalAccent, companyInitials } from "./supportBranding";
import type { PublicPortalPayload } from "./types";
import { PublicSupportTicketLookup } from "./PublicSupportTicketLookup";

type Props = {
  portal: PublicPortalPayload;
  accent: string;
};

function SidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-background/90 px-3.5 py-3 shadow-sm dark:bg-card/50">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 text-sm leading-snug text-foreground/90">{children}</div>
    </div>
  );
}

export function PublicSupportSidebar({ portal, accent }: Props) {
  const a = portalAccent(portal.primary_color, accent);
  const company = portal.company_name?.trim() || "Empresa";

  const logoBlock = portal.logo_url ? (
    <img
      src={portal.logo_url}
      alt=""
      className="h-9 w-auto max-w-[160px] object-contain sm:h-10 lg:h-12 lg:max-w-[220px]"
    />
  ) : (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-sm ring-1 ring-black/[0.06] sm:h-10 sm:w-10 sm:text-xs lg:h-12 lg:w-12 lg:text-sm"
      style={{ backgroundColor: a }}
      aria-hidden
    >
      {companyInitials(company)}
    </div>
  );

  return (
    <aside
      className={cn(
        "shrink-0 border-border bg-muted/40 px-4 py-4 sm:px-5 lg:w-[min(360px,100%)] lg:border-r lg:px-6 lg:py-8",
      )}
    >
      <div className="flex flex-row items-start gap-3 sm:gap-4 lg:flex-col lg:gap-5">
        <div className="flex shrink-0 justify-center lg:justify-start">{logoBlock}</div>

        <div className="min-w-0 flex-1 space-y-2 lg:flex-none">
          <span
            className="inline-flex max-w-full items-center rounded-md border border-border/70 bg-background/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm sm:text-[11px]"
            style={{ borderLeftColor: a, borderLeftWidth: 3 }}
          >
            Central de suporte
          </span>
          <h1 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground sm:text-base lg:text-lg">
            {company}
          </h1>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground lg:hidden">
        Atendimento oficial. Informações usadas apenas para este suporte.
      </p>

      {(portal.welcome_message?.trim() || portal.description?.trim()) && (
        <p className="mt-4 hidden max-h-[7.5rem] overflow-hidden text-ellipsis text-sm leading-relaxed text-muted-foreground lg:block">
          {portal.welcome_message?.trim() || portal.description?.trim()}
        </p>
      )}

      <div className="mt-5 hidden space-y-3 lg:block">
        <SidebarCard title="Atendimento oficial">
          Nosso time responderá sua solicitação pelo canal informado.
        </SidebarCard>

        <SidebarCard title="Seus dados estão protegidos">
          As informações enviadas são utilizadas apenas para atendimento.
        </SidebarCard>
      </div>

      <div className="mt-6 border-t border-border/60 pt-5">
        <PublicSupportTicketLookup portalSlug={portal.slug} accent={accent} />
      </div>
    </aside>
  );
}
