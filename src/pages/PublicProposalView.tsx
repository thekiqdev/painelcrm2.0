/**
 * Página pública: proposta/orçamento por token (Etapa 3). Sem login.
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { publicApiGet, publicApiPost } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, FileText, Building2, Calendar, User, Send } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { isProposalDescriptionHtml, sanitizeProposalHtml } from "@/utils/proposalRichText";
import { PublicTenantBrandMark } from "@/components/tenant/PublicTenantBrand";
import { hasTenantLogoForTheme } from "@/utils/tenantBranding";
import { useTheme } from "next-themes";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import { cn } from "@/lib/utils";

export interface PublicProposalItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface PublicProposalViewPayload {
  kind: "proposal_public_view";
  title: string;
  description: string | null;
  items: PublicProposalItem[];
  amount: number;
  client_name: string | null;
  tenant_name: string | null;
  tenant_branding?: {
    name: string | null;
    logo_url: string | null;
    logo_light_url: string | null;
    logo_dark_url: string | null;
  };
  responsible_display: string;
  status: string;
  display_status: string;
  status_label: string;
  valid_until: string | null;
  sent_date: string | null;
  can_accept: boolean;
  can_reject: boolean;
  is_expired_by_validity: boolean;
  converted_invoice_id: string | null;
  disclaimer: string;
}

/** Rótulo curto para o resumo lateral (uma linha por item). */
function truncateItemLabel(raw: string, maxLen: number): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "Item";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

/** Classes compartilhadas: conteúdo comercial legível no mobile, sem estourar largura. */
const publicProposalBodyProseClass = cn(
  "min-w-0 max-w-full",
  "break-words [overflow-wrap:anywhere] [word-break:break-word]",
  "prose prose-sm sm:prose-base dark:prose-invert max-w-none",
  "text-slate-700 dark:text-slate-300",
  "prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:text-slate-900 dark:prose-headings:text-slate-100",
  "prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-base",
  "prose-p:my-3 prose-p:leading-relaxed first:prose-p:mt-0 last:prose-p:mb-0",
  "prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-relaxed",
  "prose-strong:font-semibold prose-strong:text-slate-900 dark:prose-strong:text-slate-100",
  "prose-a:break-words prose-a:text-primary prose-a:underline prose-a:underline-offset-2",
  "prose-blockquote:border-l-primary/50 prose-blockquote:text-slate-600 dark:prose-blockquote:text-slate-400",
  "prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] dark:prose-code:bg-slate-800",
  "prose-pre:my-4 prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:rounded-lg prose-pre:border prose-pre:border-slate-200 prose-pre:bg-slate-50 prose-pre:text-xs sm:prose-pre:text-sm dark:prose-pre:border-slate-700 dark:prose-pre:bg-slate-900/80",
  "prose-img:my-4 prose-img:max-h-[min(70vh,28rem)] prose-img:w-auto prose-img:max-w-full prose-img:rounded-lg prose-img:border prose-img:border-slate-200/80 dark:prose-img:border-slate-700",
  "[&_table]:w-full [&_table]:min-w-0 [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left dark:[&_th]:border-slate-700 dark:[&_th]:bg-slate-800/80",
  "[&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1.5 dark:[&_td]:border-slate-700",
);

const PublicProposalView = () => {
  const { token } = useParams<{ token: string }>();
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<PublicProposalViewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<"accept" | "reject" | null>(null);

  const load = useCallback(async () => {
    const t = token?.trim();
    if (!t) {
      setError("Link inválido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await publicApiGet<PublicProposalViewPayload>(
      `/api/public/proposals/view/${encodeURIComponent(t)}`
    );
    if (res.error || !res.data) {
      setError(res.error || "Não foi possível carregar a proposta.");
      setData(null);
    } else {
      setData(res.data);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const formatDate = (iso: string | null | undefined) => formatDateOnlyPtBr(iso);

  const handleAccept = async () => {
    const t = token?.trim();
    if (!t || !data?.can_accept) return;
    setActionBusy("accept");
    const res = await publicApiPost<{ ok: boolean }>(
      `/api/public/proposals/view/${encodeURIComponent(t)}/accept`,
      {}
    );
    setActionBusy(null);
    if (res.error || !res.data?.ok) {
      toast.error(res.error || "Não foi possível aceitar.");
      return;
    }
    toast.success("Proposta aceita. O time comercial dará continuidade.");
    await load();
  };

  const handleReject = async () => {
    const t = token?.trim();
    if (!t || !data?.can_reject) return;
    setActionBusy("reject");
    const res = await publicApiPost<{ ok: boolean }>(
      `/api/public/proposals/view/${encodeURIComponent(t)}/reject`,
      {}
    );
    setActionBusy(null);
    if (res.error || !res.data?.ok) {
      toast.error(res.error || "Não foi possível recusar.");
      return;
    }
    toast.success("Resposta registrada.");
    await load();
  };

  const showDiscountCol = useMemo(
    () => !!data?.items?.some((it) => (Number(it.discount) || 0) > 0),
    [data?.items]
  );

  const descriptionBlock = useMemo(() => {
    if (!data?.description?.trim()) return null;
    const raw = data.description.trim();
    if (isProposalDescriptionHtml(raw)) {
      return { kind: "html" as const, html: sanitizeProposalHtml(raw) };
    }
    return { kind: "text" as const, text: raw };
  }, [data?.description]);

  /** Mini resumo para o card lateral (até 2 linhas + contagem). */
  const sidebarItemsPreview = useMemo(() => {
    const items = data?.items ?? [];
    if (items.length === 0) {
      return { kind: "empty" as const };
    }
    const maxLines = 2;
    const lines = items.slice(0, maxLines).map((it) => truncateItemLabel(it.description, 70));
    const remaining = items.length - lines.length;
    return { kind: "list" as const, count: items.length, lines, remaining };
  }, [data?.items]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-slate-950">
        <Card className="max-w-md w-full shadow-lg border-slate-200 dark:border-slate-800">
          <CardContent className="pt-8 pb-8 text-center space-y-2">
            <FileText className="h-10 w-10 mx-auto text-slate-400" />
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Proposta indisponível</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{error || "Link inválido ou revogado."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tenantTitle = data.tenant_name?.trim() || "Proposta comercial";
  const tenantBranding = data.tenant_branding ?? {
    name: data.tenant_name,
    logo_url: null,
    logo_light_url: null,
    logo_dark_url: null,
  };
  const hasTenantLogo = hasTenantLogoForTheme(resolvedTheme, tenantBranding);
  const statusVariant =
    data.display_status === "accepted" || data.display_status === "invoiced"
      ? "default"
      : data.display_status === "rejected" || data.display_status === "expired"
        ? "destructive"
        : "secondary";

  const isInvoiced = data.display_status === "invoiced" || !!data.converted_invoice_id;
  const showActionBar = data.can_accept || data.can_reject;

  const metaCardClass =
    "rounded-xl border border-slate-200/90 bg-white/70 px-3.5 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/50 sm:px-4";

  return (
    <div
      className={cn(
        "min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100",
        showActionBar && "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:pb-8",
        !showActionBar && "pb-10",
      )}
    >
      <header className="border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
            <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <PublicTenantBrandMark
                branding={tenantBranding}
                nameShownElsewhere
                fallbackIcon={<Building2 className="h-5 w-5 text-slate-400" />}
                className="shrink-0 sm:pt-0.5"
                textClassName="text-slate-900 dark:text-slate-100"
              />
              <div className="min-w-0 flex-1 space-y-3">
                {!hasTenantLogo ? (
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {tenantTitle}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
                  <h1 className="min-w-0 max-w-[min(100%,42rem)] text-xl font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl lg:text-3xl">
                    {data.title}
                  </h1>
                  <Badge
                    variant={statusVariant}
                    className="shrink-0 px-3 py-1 text-xs font-medium sm:text-sm lg:hidden"
                  >
                    {data.status_label}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  <span className="text-slate-500 dark:text-slate-500">Preparada para </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {data.client_name || "—"}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 lg:flex-col lg:items-end">
              <Badge
                variant={statusVariant}
                className="hidden px-3 py-1 text-sm font-medium lg:inline-flex"
              >
                {data.status_label}
              </Badge>
              <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white px-4 py-3 shadow-sm dark:border-slate-700 dark:from-slate-900/80 dark:to-slate-900/40 sm:min-w-[200px] lg:text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total da proposta</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
                  {formatCurrency(data.amount)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className={metaCardClass}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Calendar className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                Validade
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatDate(data.valid_until)}
              </p>
            </div>
            <div className={metaCardClass}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                Contato comercial
              </div>
              <p className="mt-1.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100" title={data.responsible_display}>
                {data.responsible_display}
              </p>
            </div>
            <div className={metaCardClass}>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Send className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                Envio
              </div>
              <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatDate(data.sent_date)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-w-0 max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:py-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-6">
        {descriptionBlock && (
          <Card className="min-w-0 max-w-full overflow-hidden border-slate-200/90 shadow-sm dark:border-slate-800">
            <CardContent className="min-w-0 max-w-full overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
              <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100 sm:mb-5 sm:text-lg">
                Sobre esta proposta
              </h2>
              {descriptionBlock.kind === "html" ? (
                <div className="min-w-0 max-w-full">
                  <div className="-mx-1 max-w-full min-w-0 overflow-x-auto overscroll-x-contain px-1 sm:mx-0 sm:px-0">
                    <div
                      className={publicProposalBodyProseClass}
                      dangerouslySetInnerHTML={{ __html: descriptionBlock.html }}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "min-w-0 max-w-full text-[15px] leading-[1.65] sm:text-base",
                    "whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                    "text-slate-700 dark:text-slate-300",
                  )}
                >
                  {descriptionBlock.text}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden border-slate-200/90 shadow-md dark:border-slate-800">
          <CardContent className="p-0">
            <div className="border-b border-slate-200 bg-slate-50/95 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/90 sm:px-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">
                Itens e valores
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                Detalhamento comercial da oferta. O total abaixo confere com o valor no topo da página.
              </p>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[680px]">
                <div className="grid grid-cols-12 gap-3 border-b border-slate-200 bg-slate-50/90 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                  <div className="col-span-5">Descrição</div>
                  <div className="col-span-2 text-center">Qtd</div>
                  <div className="col-span-2 text-right">Unitário</div>
                  {showDiscountCol ? <div className="col-span-1 text-right">Desc.</div> : null}
                  <div className={`text-right ${showDiscountCol ? "col-span-2" : "col-span-3"}`}>Total linha</div>
                </div>
                {data.items.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-slate-500">
                    Valor único da proposta (sem linhas detalhadas).
                  </div>
                ) : (
                  data.items.map((it, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-12 gap-3 border-b border-slate-100 px-5 py-3.5 text-sm last:border-b-0 dark:border-slate-800/80"
                    >
                      <div className="col-span-5 font-medium leading-snug text-slate-800 dark:text-slate-200">
                        {it.description}
                      </div>
                      <div className="col-span-2 self-center text-center tabular-nums text-slate-600 dark:text-slate-400">
                        {it.quantity}
                      </div>
                      <div className="col-span-2 self-center text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {formatCurrency(it.unitPrice)}
                      </div>
                      {showDiscountCol ? (
                        <div className="col-span-1 self-center text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {(Number(it.discount) || 0) > 0 ? formatCurrency(it.discount) : "—"}
                        </div>
                      ) : null}
                      <div
                        className={`self-center text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 ${
                          showDiscountCol ? "col-span-2" : "col-span-3"
                        }`}
                      >
                        {formatCurrency(it.total)}
                      </div>
                    </div>
                  ))
                )}
                <div className="grid grid-cols-12 gap-3 border-t-2 border-slate-300 bg-gradient-to-r from-slate-50 to-white px-5 py-5 dark:border-slate-600 dark:from-slate-900/90 dark:to-slate-900/60">
                  <div
                    className={`flex items-center justify-end text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 ${
                      showDiscountCol ? "col-span-10" : "col-span-9"
                    }`}
                  >
                    Total geral
                  </div>
                  <div
                    className={`text-right text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50 ${
                      showDiscountCol ? "col-span-2" : "col-span-3"
                    }`}
                  >
                    {formatCurrency(data.amount)}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {data.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/30">
                  Valor único da proposta (sem linhas detalhadas).
                </div>
              ) : (
                data.items.map((it, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50"
                  >
                    <div className="border-l-4 border-l-primary/70 pl-3 dark:border-l-primary/60">
                      <p className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                        {it.description}
                      </p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs sm:text-sm">
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Quantidade</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {it.quantity}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Unitário</dt>
                        <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCurrency(it.unitPrice)}
                        </dd>
                      </div>
                      {showDiscountCol ? (
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Desconto</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {(Number(it.discount) || 0) > 0 ? formatCurrency(it.discount) : "—"}
                          </dd>
                        </div>
                      ) : null}
                      <div className="col-span-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <dt className="text-slate-500 dark:text-slate-400">Total da linha</dt>
                        <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-900 dark:text-slate-50">
                          {formatCurrency(it.total)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))
              )}
              <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-300 bg-gradient-to-br from-slate-50 to-white px-4 py-4 shadow-sm dark:border-slate-600 dark:from-slate-900 dark:to-slate-900/70">
                <p className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Total geral
                </p>
                <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatCurrency(data.amount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Alert className="border-slate-200/90 bg-white/90 dark:border-slate-800 dark:bg-slate-900/40">
          <AlertDescription className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm">
            {data.disclaimer}
          </AlertDescription>
        </Alert>

        {isInvoiced && (
          <p className="text-center text-sm text-blue-900 dark:text-blue-100 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl py-4 px-4">
            Esta proposta foi faturada. O time segue com os próximos passos de pagamento e documentos fiscais.
          </p>
        )}

        {data.display_status === "accepted" && !isInvoiced && (
          <p className="text-center text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:text-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl py-4 px-4 flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Proposta aceita. Em breve o time dará continuidade ao próximo passo.
          </p>
        )}

        {data.display_status === "rejected" && (
          <p className="text-center text-sm text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl py-4 px-4 bg-white/60 dark:bg-slate-900/40">
            Obrigado pelo retorno. Esta proposta foi registrada como recusada.
          </p>
        )}

        {!data.can_accept && !data.can_reject && data.status === "sent" && data.is_expired_by_validity && (
          <p className="text-center text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl py-4 px-4">
            Esta proposta não está mais dentro do prazo de validade. Entre em contato com o comercial para uma nova
            versão.
          </p>
        )}
        </section>
        <aside className="hidden lg:block">
          <Card className="sticky top-6 border-slate-200/90 shadow-md dark:border-slate-800">
            <CardContent className="space-y-5 p-5">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resumo</p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                  {formatCurrency(data.amount)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white/60 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Itens incluídos</p>
                {sidebarItemsPreview.kind === "empty" ? (
                  <p className="mt-2 text-xs leading-snug text-slate-600 dark:text-slate-400">
                    Valor único — sem linhas detalhadas na proposta. Veja o total acima e o detalhamento no corpo da
                    página, se houver.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {sidebarItemsPreview.count} {sidebarItemsPreview.count === 1 ? "item" : "itens"}
                    </p>
                    <ul className="mt-2 list-none space-y-1.5 text-sm leading-snug text-slate-800 dark:text-slate-200">
                      {sidebarItemsPreview.lines.map((line, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/70" aria-hidden />
                          <span className="min-w-0 break-words">{line}</span>
                        </li>
                      ))}
                    </ul>
                    {sidebarItemsPreview.remaining > 0 ? (
                      <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        +{sidebarItemsPreview.remaining}{" "}
                        {sidebarItemsPreview.remaining === 1 ? "item" : "itens"} — detalhes completos no corpo da página
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span className="shrink-0 text-slate-500">Status</span>
                  <span className="text-right font-medium text-slate-900 dark:text-slate-100">{data.status_label}</span>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span className="shrink-0 text-slate-500">Validade</span>
                  <span className="text-right font-medium tabular-nums">{formatDate(data.valid_until)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="shrink-0 text-slate-500">Cliente</span>
                  <span className="max-w-[65%] truncate text-right font-medium" title={data.client_name || undefined}>
                    {data.client_name || "—"}
                  </span>
                </div>
              </div>
              {(data.can_accept || data.can_reject) && (
                <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                  <p className="mb-3.5 text-center text-xs font-medium leading-snug text-slate-600 dark:text-slate-400">
                    Sua decisão sobre esta proposta
                  </p>
                  <div className="flex flex-row items-stretch gap-2.5">
                    {data.can_accept ? (
                      <Button
                        className={cn(
                          "h-11 min-w-0 gap-1.5 rounded-xl px-3 text-sm font-bold leading-tight shadow-md transition-shadow hover:shadow-lg sm:h-12",
                          "whitespace-normal text-center [text-wrap:balance]",
                          data.can_reject ? "flex-[1.86]" : "flex-1",
                        )}
                        size="lg"
                        onClick={() => void handleAccept()}
                        disabled={actionBusy !== null}
                      >
                        {actionBusy === "accept" ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        )}
                        Aceitar proposta
                      </Button>
                    ) : null}
                    {data.can_reject ? (
                      <Button
                        variant="outline"
                        className={cn(
                          "h-11 min-w-0 flex-1 gap-1.5 rounded-xl border-2 border-slate-200 bg-white/90 px-3 text-sm font-medium leading-tight text-slate-600 shadow-none sm:h-12",
                          "hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-900/60",
                        )}
                        size="lg"
                        onClick={() => void handleReject()}
                        disabled={actionBusy !== null}
                      >
                        {actionBusy === "reject" ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0" />
                        )}
                        Recusar
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </main>

      {showActionBar && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/90 bg-white/95 shadow-[0_-8px_32px_rgba(15,23,42,0.08)] backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
          <div className="mx-auto max-w-6xl px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            <p className="mb-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
              Toque para registrar sua resposta comercial
            </p>
            <div className="flex flex-row items-stretch gap-2">
              {data.can_reject && (
                <Button
                  variant="outline"
                  className="h-12 min-h-[48px] min-w-0 flex-1 gap-1.5 rounded-xl border-2 border-slate-300 bg-white px-2.5 text-sm font-medium leading-tight dark:border-slate-600 dark:bg-slate-950 sm:px-3 sm:text-base"
                  size="lg"
                  onClick={() => void handleReject()}
                  disabled={actionBusy !== null}
                >
                  {actionBusy === "reject" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0" />
                  )}
                  Recusar
                </Button>
              )}
              {data.can_accept && (
                <Button
                  className={cn(
                    "h-12 min-h-[48px] min-w-0 gap-1.5 rounded-xl px-2.5 text-sm font-bold leading-tight shadow-md sm:px-3 sm:text-base",
                    "whitespace-normal text-center [text-wrap:balance]",
                    data.can_reject ? "flex-[1.58]" : "flex-1",
                  )}
                  size="lg"
                  onClick={() => void handleAccept()}
                  disabled={actionBusy !== null}
                >
                  {actionBusy === "accept" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  )}
                  Aceitar proposta
                </Button>
              )}
            </div>
          </div>
        </footer>
      )}

      {!data.can_accept && !data.can_reject && (
        <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-xs text-slate-400">
          Documento para fins comerciais. Em caso de dúvida, responda ao seu contato na empresa.
        </footer>
      )}
    </div>
  );
};

export default PublicProposalView;
