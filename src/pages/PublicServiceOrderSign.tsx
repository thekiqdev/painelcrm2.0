/**
 * Página pública de assinatura da Ordem de Serviço (OS-S4).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApiGet, publicApiPost } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractA4Document } from "@/components/contracts/ContractA4Document";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { FileSignature, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { SignaturePad, type SignaturePadHandle } from "@/components/contracts/SignaturePad";
import { PublicTenantBrandMark } from "@/components/tenant/PublicTenantBrand";
import { hasTenantLogoForTheme } from "@/utils/tenantBranding";
import { useTheme } from "next-themes";

type TenantPublic = {
  name: string | null;
  logo_url: string | null;
  logo_light_url?: string | null;
  logo_dark_url?: string | null;
};

type PendingPayload = {
  kind: "service_order_public_signature";
  state: "pending";
  title: string;
  service_order_number: number;
  document_html: string | null;
  signer_name: string;
  signer_role?: string;
  tenant: TenantPublic;
  accept_terms_version: string;
  disclaimer: string;
};

type AlreadyPayload = {
  kind: "service_order_public_signature";
  state: "already_signed";
  title: string;
  service_order_number: number;
  signer_name: string;
  signed_at: string | null;
  tenant: TenantPublic;
  message: string;
};

const PublicServiceOrderSign = () => {
  const { token } = useParams<{ token: string }>();
  const { resolvedTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [httpError, setHttpError] = useState<string | null>(null);
  const [payload, setPayload] = useState<PendingPayload | AlreadyPayload | null>(null);
  const [confirmedName, setConfirmedName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signaturePadReady, setSignaturePadReady] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token?.trim()) {
        setHttpError("Convite inválido.");
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await publicApiGet<PendingPayload | AlreadyPayload>(
        `/api/public/service-orders/sign/${encodeURIComponent(token)}`,
      );
      if (cancelled) return;
      if (res.error || !res.data) {
        setHttpError(res.error || "Não foi possível carregar o convite.");
        setPayload(null);
      } else {
        setPayload(res.data);
        if (res.data.state === "pending") {
          setConfirmedName(res.data.signer_name || "");
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isPending = payload?.state === "pending";
  const canSubmit = useMemo(() => {
    if (!isPending || !payload) return false;
    return acceptTerms && confirmedName.trim().length >= 2 && signaturePadReady;
  }, [acceptTerms, confirmedName, isPending, payload, signaturePadReady]);

  const handleSubmit = async () => {
    if (!token?.trim() || !isPending || !canSubmit) return;
    setSubmitting(true);
    const b64 = sigRef.current?.getPngBase64();
    if (!b64) {
      toast.error("Desenhe a sua assinatura antes de enviar.");
      setSubmitting(false);
      return;
    }
    const res = await publicApiPost<{ message?: string }>(
      `/api/public/service-orders/sign/${encodeURIComponent(token)}`,
      { accept_terms: true, confirmed_name: confirmedName, signature_image_base64: b64 },
    );
    setSubmitting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(res.data?.message || "Assinatura registada.");
    const refresh = await publicApiGet<PendingPayload | AlreadyPayload>(
      `/api/public/service-orders/sign/${encodeURIComponent(token)}`,
    );
    if (!refresh.error && refresh.data) setPayload(refresh.data);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (httpError || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-lg">Assinatura indisponível</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{httpError}</CardContent>
        </Card>
      </div>
    );
  }

  if (payload.state === "already_signed") {
    const done = payload as AlreadyPayload;
    return (
      <div className="min-h-screen bg-muted/40">
        <header className="border-b bg-background/95">
          <div className="mx-auto max-w-4xl px-4 py-5">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <h1 className="text-lg font-semibold">Assinatura concluída</h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong>{done.title}</strong>
            </p>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-sm">{done.message}</p>
        </main>
      </div>
    );
  }

  const p = payload as PendingPayload;
  const hasTenantLogo = hasTenantLogoForTheme(resolvedTheme, p.tenant);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <PublicTenantBrandMark
              branding={p.tenant}
              nameShownElsewhere
              hideNameWhenLogo
              fallbackIcon={<FileSignature className="h-5 w-5 text-muted-foreground" />}
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <FileSignature className="h-3 w-3" />
                Assinatura eletrónica
              </p>
              <h1 className="mt-0.5 truncate text-lg font-semibold sm:text-xl">{p.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {!hasTenantLogo && p.tenant.name ? <span>{p.tenant.name} · </span> : null}
                <span>Nº {p.service_order_number}</span>
              </p>
            </div>
          </div>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Signatário: {p.signer_name}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-3 py-8 sm:px-4">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Leitura do documento</AlertTitle>
          <AlertDescription>{p.disclaimer}</AlertDescription>
        </Alert>

        <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/50 p-2 sm:p-4">
          <ContractA4Document
            documentKind="service_order"
            scaleToFit
            html={p.document_html || "<p>Sem conteúdo.</p>"}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confirmar e assinar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="confirmed-name">Nome completo (deve coincidir com o registado)</Label>
              <Input
                id="confirmed-name"
                value={confirmedName}
                onChange={(e) => setConfirmedName(e.target.value)}
                autoComplete="name"
                placeholder={p.signer_name}
              />
              <p className="text-xs text-muted-foreground">Nome esperado: {p.signer_name}</p>
            </div>
            <div className="space-y-3 border-t border-border/60 pt-1">
              <Label className="text-base">Assinatura manuscrita (obrigatória)</Label>
              <SignaturePad
                ref={sigRef}
                disabled={submitting}
                onDrawingChange={(ink) => setSignaturePadReady(ink)}
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="accept-terms"
                checked={acceptTerms}
                onCheckedChange={(v) => setAcceptTerms(v === true)}
              />
              <Label htmlFor="accept-terms" className="cursor-pointer text-sm font-normal leading-snug">
                Declaro que li o documento e aceito assinar eletronicamente esta ordem de serviço.
              </Label>
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!canSubmit || submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A registar…
                </>
              ) : (
                "Assinar ordem de serviço"
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PublicServiceOrderSign;
