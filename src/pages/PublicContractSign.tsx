/**
 * Página pública de assinatura por convite (Etapa 4).
 * Separada de /contract-view (visualização somente leitura).
 */
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { publicApiGet, publicApiPost } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContractA4Document } from "@/components/contracts/ContractA4Document";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  kind: "contract_public_signature";
  state: "pending";
  title: string;
  contract_number: string;
  document_html: string;
  signer_name: string;
  tenant: TenantPublic;
  accept_terms_version: string;
  disclaimer: string;
};

type AlreadyPayload = {
  kind: "contract_public_signature";
  state: "already_signed";
  title: string;
  contract_number: string;
  signer_name: string;
  signed_at: string | null;
  tenant: TenantPublic;
  message: string;
};

const PublicContractSign = () => {
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
      setHttpError(null);
      const res = await publicApiGet<PendingPayload | AlreadyPayload>(
        `/api/public/contracts/sign/${encodeURIComponent(token)}`
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
    const res = await publicApiPost<{ ok?: boolean; message?: string }>(
      `/api/public/contracts/sign/${encodeURIComponent(token)}`,
      { accept_terms: true, confirmed_name: confirmedName, signature_image_base64: b64 }
    );
    setSubmitting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(res.data?.message || "Assinatura registada.");
    const refresh = await publicApiGet<PendingPayload | AlreadyPayload>(
      `/api/public/contracts/sign/${encodeURIComponent(token)}`
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
        <Card className="max-w-md w-full shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Assinatura indisponível</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{httpError}</CardContent>
        </Card>
      </div>
    );
  }

  if (payload.state === "already_signed") {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
              <CardTitle>Assinatura já concluída</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{payload.message}</p>
            <p className="text-muted-foreground">
              <strong>{payload.title}</strong> · Nº {payload.contract_number}
            </p>
            <p className="text-muted-foreground">Signatário: {payload.signer_name}</p>
            {payload.signed_at ? (
              <p className="text-muted-foreground text-xs">
                Registo: {new Date(payload.signed_at).toLocaleString("pt-BR")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const p = payload as PendingPayload;
  const hasTenantLogo = hasTenantLogoForTheme(resolvedTheme, p.tenant);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3 min-w-0">
            <PublicTenantBrandMark
              branding={p.tenant}
              nameShownElsewhere
              fallbackIcon={<FileSignature className="h-5 w-5 text-muted-foreground" />}
            />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <FileSignature className="h-3 w-3" />
                Assinatura eletrónica
              </p>
              <h1 className="text-lg sm:text-xl font-semibold leading-snug mt-0.5 truncate">{p.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {!hasTenantLogo && p.tenant.name ? <span>{p.tenant.name}</span> : null}
                {!hasTenantLogo && p.tenant.name ? " · " : null}
                <span>Nº {p.contract_number}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end shrink-0">
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Signatário: {p.signer_name}
            </Badge>
            <span className="text-xs text-muted-foreground">Pendente de assinatura</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-8 space-y-8">
        <Alert className="border-muted">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Leitura do documento</AlertTitle>
          <AlertDescription>{p.disclaimer}</AlertDescription>
        </Alert>

        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
            Documento (conteúdo congelado)
          </p>
          <div className="rounded-xl bg-muted/50 p-3 sm:p-5 border border-border/60">
            <ContractA4Document html={p.document_html || "<p>Sem conteúdo.</p>"} />
          </div>
        </section>

        <Card className="shadow-md border-border/80">
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
              <p className="text-xs text-muted-foreground">Nome esperado no convite: {p.signer_name}</p>
            </div>
            <div className="space-y-3 pt-1 border-t border-border/60">
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
              <Label htmlFor="accept-terms" className="text-sm font-normal leading-snug cursor-pointer">
                Declaro que li o documento acima e aceito assinar eletronicamente este contrato com a assinatura
                desenhada, reconhecendo a validade desta assinatura nos termos aplicáveis (versão{" "}
                {p.accept_terms_version}).
              </Label>
            </div>
            <Button type="button" className="w-full sm:w-auto" disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A registar…
                </>
              ) : (
                "Assinar contrato"
              )}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-8">
          Este fluxo é apenas de assinatura. Para apenas ler o contrato sem assinar, use o link de visualização
          fornecido separadamente pela empresa.
        </p>
      </main>
    </div>
  );
};

export default PublicContractSign;
