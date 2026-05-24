/**
 * Página pública read-only: visualização do contrato por token (Etapa 3).
 * Não exige login; não oferece assinatura. Assinaturas concluídas são exibidas; PDF alinhado ao snapshot.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApiGet, publicApiGetPdf } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContractA4Document } from "@/components/contracts/ContractA4Document";
import { ContractPdfViewer } from "@/components/contracts/ContractPdfViewer";
import { ContractPdfDownloadButton } from "@/components/contracts/ContractPdfDownloadButton";
import { FileText, Loader2, Eye } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { PublicTenantBrandMark } from "@/components/tenant/PublicTenantBrand";
import { hasTenantLogoForTheme } from "@/utils/tenantBranding";
import { useTheme } from "next-themes";

export interface PublicContractViewSigner {
  id?: string;
  name: string;
  email: string;
  tax_id: string | null;
  signed: boolean;
  signed_at: string | null;
  signature_image_png_base64: string | null;
  client_ip?: string | null;
  method?: string | null;
  signature_id?: string | null;
  confirmed_name?: string | null;
}

export interface PublicContractViewPayload {
  kind: "contract_public_view";
  title: string;
  status: string;
  status_label: string;
  contract_number: string;
  document_kind?: "html_editor" | "pdf_signature";
  signed_pdf_available?: boolean;
  document_html: string;
  client_name: string | null;
  tenant: {
    name: string | null;
    logo_url: string | null;
    logo_light_url?: string | null;
    logo_dark_url?: string | null;
  };
  responsible_display_name: string | null;
  signers: PublicContractViewSigner[];
  disclaimer: string;
}

const PublicContractView = () => {
  const { token } = useParams<{ token: string }>();
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<PublicContractViewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadPublicViewPdf = useCallback(async () => {
    if (!token?.trim()) throw new Error("Link inválido.");
    const res = await publicApiGetPdf(
      `/api/public/contracts/view/${encodeURIComponent(token)}/pdf`,
    );
    if (!res.ok) throw new Error(res.error);
    return res.blob;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token?.trim()) {
        setError("Link inválido.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const res = await publicApiGet<PublicContractViewPayload>(
        `/api/public/contracts/view/${encodeURIComponent(token)}`,
      );
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(res.error || "Não foi possível carregar o documento.");
        setData(null);
      } else {
        setData(res.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleDownloadPdf = async () => {
    if (!token?.trim()) return;
    const res = await publicApiGetPdf(`/api/public/contracts/view/${encodeURIComponent(token)}/pdf`);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const u = URL.createObjectURL(res.blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = res.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(u);
    toast.success("Download iniciado");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Visualização indisponível</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      </div>
    );
  }

  const hasTenantLogo = hasTenantLogoForTheme(resolvedTheme, data.tenant);
  const isPdfDoc = data.document_kind === "pdf_signature";
  const downloadLabel = data.signed_pdf_available
    ? "Baixar PDF assinado"
    : isPdfDoc
      ? "Baixar PDF"
      : "Baixar contrato (PDF)";

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3 min-w-0">
            <PublicTenantBrandMark
              branding={data.tenant}
              nameShownElsewhere
              fallbackIcon={<FileText className="h-5 w-5 text-muted-foreground" />}
            />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold leading-snug">{data.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {!hasTenantLogo && data.tenant.name ? <span>{data.tenant.name}</span> : null}
                {!hasTenantLogo && data.tenant.name ? " · " : null}
                <span>Nº {data.contract_number}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            <Badge variant="secondary" className="w-fit font-normal">
              {data.status_label}
            </Badge>
            <ContractPdfDownloadButton
              label={downloadLabel}
              prominent={Boolean(data.signed_pdf_available)}
              size="sm"
              className="w-full sm:w-auto"
              onDownload={handleDownloadPdf}
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-8 space-y-8">
        <Alert className="border-muted bg-muted/30">
          <Eye className="h-4 w-4" />
          <AlertDescription className="text-sm leading-relaxed">{data.disclaimer}</AlertDescription>
        </Alert>

        {(data.client_name || data.responsible_display_name) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Partes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {data.client_name ? (
                <div>
                  <span className="text-muted-foreground">Cliente: </span>
                  {data.client_name}
                </div>
              ) : null}
              {data.responsible_display_name ? (
                <div>
                  <span className="text-muted-foreground">Responsável: </span>
                  {data.responsible_display_name}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Documento</p>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 sm:p-5 dark:bg-muted/20">
            {isPdfDoc && token ? (
              <ContractPdfViewer loadPdf={loadPublicViewPdf} reloadKey={token} />
            ) : (
              <ContractA4Document
                html={data.document_html || "<p>Sem conteúdo.</p>"}
                signersAppendix={data.signers.map((s) => ({
                  id: s.id,
                  name: s.name,
                  email: s.email,
                  tax_id: s.tax_id,
                  signed: s.signed,
                  signed_at: s.signed_at,
                  signature_image_png_base64: s.signature_image_png_base64,
                  signature_data: {
                    signature_image_png_base64: s.signature_image_png_base64,
                    client_ip: s.client_ip,
                    method: s.method,
                    invite_id: s.signature_id,
                    confirmed_name: s.confirmed_name,
                    signed_at: s.signed_at,
                  },
                }))}
              />
            )}
          </div>
        </section>

      </main>
    </div>
  );
};

export default PublicContractView;
