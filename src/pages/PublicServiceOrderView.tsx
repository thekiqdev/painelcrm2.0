/**
 * Página pública read-only da Ordem de Serviço (OS-S4).
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApiGet, publicApiGetPdf } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContractA4Document } from "@/components/contracts/ContractA4Document";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Eye, Download } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { PublicTenantBrandMark } from "@/components/tenant/PublicTenantBrand";
import { hasTenantLogoForTheme } from "@/utils/tenantBranding";
import { useTheme } from "next-themes";

type Payload = {
  kind: "service_order_public_view";
  title: string;
  status: string;
  service_order_number: number;
  document_html: string;
  client_name: string | null;
  tenant: {
    name: string | null;
    logo_url: string | null;
    logo_light_url?: string | null;
    logo_dark_url?: string | null;
  };
  signers: Array<{
    id: string;
    name: string;
    role: string;
    signed: boolean;
    signed_at: string | null;
    signature_image_png_base64: string | null;
  }>;
  disclaimer: string;
};

const PublicServiceOrderView = () => {
  const { token } = useParams<{ token: string }>();
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token?.trim()) {
        setError("Link inválido.");
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await publicApiGet<Payload>(
        `/api/public/service-orders/view/${encodeURIComponent(token)}`,
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
    const res = await publicApiGetPdf(
      `/api/public/service-orders/view/${encodeURIComponent(token)}/pdf`,
    );
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const u = URL.createObjectURL(res.blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = res.filename || "ordem-servico.pdf";
    a.click();
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
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-lg">Documento indisponível</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      </div>
    );
  }

  const hasTenantLogo = hasTenantLogoForTheme(resolvedTheme, data.tenant);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex max-w-4xl items-start justify-between gap-3 px-4 py-5">
          <div className="flex min-w-0 gap-3">
            <PublicTenantBrandMark
              branding={data.tenant}
              nameShownElsewhere
              hideNameWhenLogo
              fallbackIcon={<Eye className="h-5 w-5 text-muted-foreground" />}
            />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" /> Visualização
              </p>
              <h1 className="mt-0.5 truncate text-lg font-semibold sm:text-xl">{data.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {!hasTenantLogo && data.tenant.name ? <span>{data.tenant.name} · </span> : null}
                {data.client_name ? <span>{data.client_name}</span> : null}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleDownloadPdf()}>
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-3 py-8 sm:px-4">
        <Alert>
          <AlertDescription>{data.disclaimer}</AlertDescription>
        </Alert>

        <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/50 p-2 sm:p-4">
          <ContractA4Document
            documentKind="service_order"
            scaleToFit
            html={data.document_html || "<p>Sem conteúdo.</p>"}
          />
        </div>

        {data.signers?.length ? (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Assinaturas
            </h2>
            <ul className="space-y-3">
              {data.signers.map((s) => (
                <li key={s.id} className="text-sm">
                  <div className="font-medium">
                    {s.name}{" "}
                    <span className="text-muted-foreground">
                      ({s.role === "technician" ? "técnico" : "cliente"})
                    </span>
                  </div>
                  {s.signed ? (
                    <p className="text-xs text-green-700">Assinado</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Pendente</p>
                  )}
                  {s.signature_image_png_base64 ? (
                    <img
                      alt={`Assinatura de ${s.name}`}
                      className="mt-1 max-h-12"
                      src={`data:image/png;base64,${s.signature_image_png_base64}`}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default PublicServiceOrderView;
