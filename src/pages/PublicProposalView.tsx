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
import { Loader2, CheckCircle2, XCircle, FileText, Building2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { isProposalDescriptionHtml, sanitizeProposalHtml } from "@/utils/proposalRichText";
import { PublicTenantBrandMark } from "@/components/tenant/PublicTenantBrand";
import { hasTenantLogoForTheme } from "@/utils/tenantBranding";
import { useTheme } from "next-themes";

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

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("pt-BR");
    } catch {
      return iso;
    }
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 pb-32">
      <div className="border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
              <PublicTenantBrandMark
                branding={tenantBranding}
                nameShownElsewhere
                fallbackIcon={<Building2 className="h-5 w-5 text-slate-400" />}
                className="sm:pt-0.5"
                textClassName="text-slate-900 dark:text-slate-100"
              />
              <div className="min-w-0 flex-1 space-y-1">
              {!hasTenantLogo ? (
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  {tenantTitle}
                </p>
              ) : null}
              <h1 className="text-2xl sm:text-3xl font-semibold leading-tight tracking-tight">{data.title}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Cliente: <span className="font-medium text-slate-900 dark:text-slate-100">{data.client_name || "—"}</span>
              </p>
              </div>
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
              <Badge variant={statusVariant} className="w-fit text-sm px-3 py-1">
                {data.status_label}
              </Badge>
              <div className="text-right">
                <p className="text-xs uppercase text-slate-500 font-medium">Total</p>
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(data.amount)}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">Validade</p>
              <p className="font-medium">{formatDate(data.valid_until)}</p>
            </div>
            <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">Contato</p>
              <p className="font-medium truncate">{data.responsible_display}</p>
            </div>
            <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2 col-span-2 sm:col-span-1">
              <p className="text-[10px] uppercase text-slate-500 font-semibold">Envio</p>
              <p className="font-medium">{formatDate(data.sent_date)}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {descriptionBlock && (
          <Card className="border-slate-200/90 dark:border-slate-800 shadow-sm">
            <CardContent className="pt-6 pb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Descrição / conteúdo comercial</h2>
              {descriptionBlock.kind === "html" ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: descriptionBlock.html }}
                />
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {descriptionBlock.text}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200/90 dark:border-slate-800 shadow-md overflow-hidden">
          <CardContent className="p-0">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Itens e valores
              </h2>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-50/90 dark:bg-slate-900/90 text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <div className="col-span-5">Descrição</div>
                  <div className="col-span-2 text-center">Qtd</div>
                  <div className="col-span-2 text-right hidden sm:block">Unit.</div>
                  {showDiscountCol && <div className="col-span-1 text-right hidden sm:block">Desc.</div>}
                  <div className={`text-right ${showDiscountCol ? "col-span-2" : "col-span-3"}`}>Total</div>
                </div>
                {data.items.length === 0 ? (
                  <div className="px-4 py-10 text-sm text-slate-500 text-center">
                    Valor único da proposta (sem linhas detalhadas).
                  </div>
                ) : (
                  data.items.map((it, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b border-slate-100 dark:border-slate-800/80 items-center"
                    >
                      <div className="col-span-5 font-medium text-slate-800 dark:text-slate-200">{it.description}</div>
                      <div className="col-span-2 text-center text-slate-600 tabular-nums">{it.quantity}</div>
                      <div className="col-span-2 text-right hidden sm:block text-slate-600 tabular-nums">
                        {formatCurrency(it.unitPrice)}
                      </div>
                      {showDiscountCol && (
                        <div className="col-span-1 text-right hidden sm:block text-slate-600 tabular-nums">
                          {(Number(it.discount) || 0) > 0 ? formatCurrency(it.discount) : "—"}
                        </div>
                      )}
                      <div
                        className={`text-right font-semibold tabular-nums ${showDiscountCol ? "col-span-2" : "col-span-3"}`}
                      >
                        {formatCurrency(it.total)}
                      </div>
                    </div>
                  ))
                )}
                <div className="grid grid-cols-12 gap-2 px-4 py-4 border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/80">
                  <div
                    className={`text-right text-sm font-semibold text-slate-600 dark:text-slate-400 ${
                      showDiscountCol ? "col-span-10" : "col-span-9"
                    }`}
                  >
                    Total geral
                  </div>
                  <div
                    className={`text-right text-lg font-bold tabular-nums ${
                      showDiscountCol ? "col-span-2" : "col-span-3"
                    }`}
                  >
                    {formatCurrency(data.amount)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Alert className="border-slate-200 bg-white/80 dark:bg-slate-900/50">
          <AlertDescription className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
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
      </main>

      {(data.can_accept || data.can_reject) && (
        <footer className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-400 hidden sm:block">
              <span className="font-medium text-slate-900 dark:text-slate-100">Sua resposta</span>
              <span className="mx-2">·</span>
              Aceite ou recuse esta oferta comercial.
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {data.can_accept && (
                <Button
                  className="flex-1 sm:flex-none sm:min-w-[160px]"
                  size="lg"
                  onClick={() => void handleAccept()}
                  disabled={actionBusy !== null}
                >
                  {actionBusy === "accept" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Aceitar proposta
                </Button>
              )}
              {data.can_reject && (
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none sm:min-w-[140px] border-slate-300 dark:border-slate-600"
                  size="lg"
                  onClick={() => void handleReject()}
                  disabled={actionBusy !== null}
                >
                  {actionBusy === "reject" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Recusar
                </Button>
              )}
            </div>
          </div>
        </footer>
      )}

      {!data.can_accept && !data.can_reject && (
        <footer className="max-w-4xl mx-auto px-4 py-10 text-center text-xs text-slate-400">
          Documento para fins comerciais. Em caso de dúvida, responda ao seu contato na empresa.
        </footer>
      )}
    </div>
  );
};

export default PublicProposalView;
