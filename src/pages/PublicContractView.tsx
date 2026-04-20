/**
 * Página pública read-only: visualização do contrato por token (Etapa 3).
 * Não exige login; não oferece assinatura. Assinaturas concluídas são exibidas; PDF alinhado ao snapshot.
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApiGet, publicApiGetPdf } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ContractA4Document } from "@/components/contracts/ContractA4Document";
import { FileText, Loader2, Eye, Download } from "lucide-react";
import { toast } from "sonner";

export interface PublicContractViewSigner {
  name: string;
  email: string;
  tax_id: string | null;
  signed: boolean;
  signed_at: string | null;
  signature_image_png_base64: string | null;
}

export interface PublicContractViewPayload {
  kind: "contract_public_view";
  title: string;
  status: string;
  status_label: string;
  contract_number: string;
  document_html: string;
  client_name: string | null;
  tenant: { name: string | null; logo_url: string | null };
  responsible_display_name: string | null;
  signers: PublicContractViewSigner[];
  disclaimer: string;
}

const PublicContractView = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicContractViewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

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
    setPdfLoading(true);
    const res = await publicApiGetPdf(`/api/public/contracts/view/${encodeURIComponent(token)}/pdf`);
    setPdfLoading(false);
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

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3 min-w-0">
            {data.tenant.logo_url ? (
              <img
                src={data.tenant.logo_url}
                alt=""
                className="h-11 w-auto object-contain max-w-[120px] shrink-0"
              />
            ) : (
              <div className="h-11 w-11 rounded-md bg-muted flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" />
                Visualização pública · somente leitura
              </p>
              <h1 className="text-lg sm:text-xl font-semibold leading-snug mt-0.5">{data.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {data.tenant.name ? <span>{data.tenant.name}</span> : null}
                {data.tenant.name ? " · " : null}
                <span>Nº {data.contract_number}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            <Badge variant="secondary" className="w-fit font-normal">
              {data.status_label}
            </Badge>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="w-full sm:w-auto gap-2"
              disabled={pdfLoading}
              onClick={() => void handleDownloadPdf()}
            >
              {pdfLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Baixar contrato (PDF)
            </Button>
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
          <div className="rounded-xl bg-muted/50 p-3 sm:p-5 border border-border/60">
            <ContractA4Document
              html={data.document_html || "<p>Sem conteúdo.</p>"}
              signersAppendix={data.signers}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default PublicContractView;
