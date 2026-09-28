import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ImageOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  PublicCatalogProduct,
  StoreProfile,
  resolvePublicCatalogUnitPrice,
} from "@/types/products";
import { productsService } from "@/services/products";
import { createStoreCheckout, fetchStoreCheckoutClientEligibility } from "@/services/storeCheckout";
import { resolveStorefrontTheme } from "@/themes/registry";
import { canUseStoreCheckout } from "@/utils/storeCheckoutVisibility";
import { getPublicProductThumbnailUrl } from "@/utils/publicCatalogImages";

function checkoutProductTeaser(product: PublicCatalogProduct): string {
  const short = product.short_description?.trim();
  if (short) return short;
  const raw = product.description?.trim();
  if (!raw) return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

const StorePublicCheckout = () => {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const [searchParams] = useSearchParams();
  const productId = (searchParams.get("productId") || "").trim();

  const idempotencyKeyRef = useRef<string | null>(null);
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `chk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [product, setProduct] = useState<PublicCatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCpfCnpj, setCustomerCpfCnpj] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsCpf, setNeedsCpf] = useState<boolean | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  useEffect(() => {
    void load();
  }, [storeSlug, productId]);

  useEffect(() => {
    let cancelled = false;
    const phone = customerPhone.trim();
    if (!storeSlug || phone.length < 10) {
      setNeedsCpf(null);
      setEligibilityLoading(false);
      return;
    }
    setEligibilityLoading(true);
    const t = window.setTimeout(() => {
      void fetchStoreCheckoutClientEligibility({
        store_slug: storeSlug,
        customer_phone: phone,
      })
        .then((res) => {
          if (cancelled) return;
          if (res.data && typeof res.data.needs_cpf === "boolean") {
            setNeedsCpf(res.data.needs_cpf);
          } else {
            setNeedsCpf(null);
          }
        })
        .catch(() => {
          if (!cancelled) setNeedsCpf(null);
        })
        .finally(() => {
          if (!cancelled) setEligibilityLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [storeSlug, customerPhone]);

  useEffect(() => {
    if (needsCpf === false) {
      setCustomerCpfCnpj("");
    }
  }, [needsCpf]);

  const load = async () => {
    if (!storeSlug || !productId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setNotFound(false);
      const [store, productData] = await Promise.all([
        productsService.getPublicStoreBySlug(storeSlug),
        productsService.getPublicProductByStoreSlugAndProductId(storeSlug, productId),
      ]);
      if (!store || !productData) {
        setNotFound(true);
        return;
      }
      if (!canUseStoreCheckout(store as StoreProfile)) {
        setNotFound(true);
        return;
      }
      const unit = resolvePublicCatalogUnitPrice(productData);
      if (unit == null) {
        setNotFound(true);
        return;
      }
      setStoreProfile(store as StoreProfile);
      setProduct(productData);
    } catch (e) {
      console.error(e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSlug || !product || !storeProfile) return;

    const unit = resolvePublicCatalogUnitPrice(product);
    if (unit == null) return;

    const email = customerEmail.trim();
    const phone = customerPhone.trim();
    const name = customerName.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSubmitError("Informe um e-mail válido.");
      return;
    }
    if (phone.length < 8) {
      setSubmitError("Informe um telefone válido com DDD.");
      return;
    }
    if (!name || name.length > 200) {
      setSubmitError("Informe seu nome completo.");
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      let effectiveNeedsCpf = needsCpf;
      if (effectiveNeedsCpf === null) {
        const er = await fetchStoreCheckoutClientEligibility({
          store_slug: storeSlug,
          customer_phone: phone,
        });
        if (er.error || er.data == null || typeof er.data.needs_cpf !== "boolean") {
          setSubmitError(er.error || "Não foi possível verificar o cadastro. Tente novamente.");
          setSubmitting(false);
          return;
        }
        effectiveNeedsCpf = er.data.needs_cpf;
        setNeedsCpf(effectiveNeedsCpf);
      }

      if (effectiveNeedsCpf) {
        const d = customerCpfCnpj.replace(/\D/g, "");
        if (d.length !== 11 && d.length !== 14) {
          setSubmitError("Informe um CPF ou CNPJ válido. É obrigatório para gerar a cobrança.");
          setSubmitting(false);
          return;
        }
      }

      const expected_total_cents = Math.round(unit * 100);
      const res = await createStoreCheckout(
        {
          store_slug: storeSlug,
          product_id: product.id,
          quantity: 1,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          customer_cpf_cnpj: effectiveNeedsCpf ? customerCpfCnpj.trim() || null : null,
          expected_total_cents,
        },
        idempotencyKeyRef.current!
      );

      if (res.error || !res.data?.payment_token) {
        const hint =
          res.field === "customer_cpf_cnpj"
            ? " Verifique o CPF ou CNPJ."
            : res.field === "customer_phone"
              ? " Verifique o telefone."
              : "";
        setSubmitError((res.error || "Não foi possível concluir o checkout.") + hint);
        return;
      }

      window.location.assign(`/pay/${res.data.payment_token}`);
    } catch (err) {
      console.error(err);
      setSubmitError("Erro de rede. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Carregando checkout…</p>
        </div>
      </div>
    );
  }

  if (notFound || !storeProfile || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-xl font-semibold">Checkout não disponível</h1>
          <p className="text-muted-foreground text-sm">
            Produto inválido, sem preço ou indisponível para compra online.
          </p>
          {storeSlug && (
            <Link to={`/${storeSlug}/loja`}>
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar à loja
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  const theme = resolveStorefrontTheme(storeProfile.theme_key);
  const Shell = theme.ProductShell;
  const unitPrice = resolvePublicCatalogUnitPrice(product);
  const displayPrice = unitPrice != null ? unitPrice.toFixed(2) : "—";
  const thumb = getPublicProductThumbnailUrl(product);
  const teaser = checkoutProductTeaser(product);

  return (
    <Shell
      storeProfile={storeProfile}
      storeSlug={storeSlug!}
      product={product}
      gallery={[]}
      relatedProducts={[]}
    >
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <Link
            to={`/${storeSlug}/loja/produto/${product.id}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao produto
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Finalizar compra</h1>
          <p className="text-sm text-muted-foreground mt-1">{storeProfile.store_name}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Resumo — coluna esquerda no desktop */}
          <div className="space-y-6 lg:sticky lg:top-6">
            <Card className="overflow-hidden border-border/80 shadow-sm">
              <CardHeader className="pb-3 bg-muted/30 border-b">
                <CardTitle className="text-base font-medium">Resumo do pedido</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">
                  Você está contratando 1 item nesta compra.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
                  <div className="shrink-0 w-full sm:w-36 aspect-square rounded-lg border bg-muted/40 overflow-hidden flex items-center justify-center">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageOff className="h-10 w-10 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <h2 className="font-semibold text-lg leading-snug">{product.name}</h2>
                    {product.type === "service" ? (
                      <span className="inline-flex text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Serviço
                      </span>
                    ) : (
                      <span className="inline-flex text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Produto
                      </span>
                    )}
                    {teaser ? (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{teaser}</p>
                    ) : null}
                    <Separator className="my-3" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Quantidade</p>
                        <p className="text-sm font-medium">1</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                        <p className="text-xl font-semibold text-primary tabular-nums">R$ {displayPrice}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg border bg-muted/20 px-4 py-3 flex gap-3 text-sm text-muted-foreground">
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <p>
                Pagamento processado de forma segura. Após confirmar seus dados, você será direcionado à página de
                pagamento (PIX, boleto ou cartão, conforme a loja).
              </p>
            </div>
          </div>

          {/* Formulário — coluna direita */}
          <Card className="shadow-md border-border/80">
            <CardHeader className="border-b bg-card/80">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
                Seus dados
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Informe e-mail e telefone primeiro. Usamos o telefone para localizar ou criar seu cadastro na loja.
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="checkout-email">E-mail *</Label>
                  <Input
                    id="checkout-email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    required
                    maxLength={320}
                    autoComplete="email"
                    placeholder="seu@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checkout-phone">WhatsApp / telefone *</Label>
                  <Input
                    id="checkout-phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    required
                    minLength={8}
                    maxLength={40}
                    autoComplete="tel"
                    placeholder="(11) 99999-9999"
                  />
                  <div className="flex items-center justify-between gap-2 min-h-[1rem]">
                    <p className="text-xs text-muted-foreground">Com DDD. Mesmo critério das faturas do sistema.</p>
                    {eligibilityLoading ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Verificando…
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checkout-name">Nome completo *</Label>
                  <Input
                    id="checkout-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    maxLength={200}
                    autoComplete="name"
                    placeholder="Como no documento"
                  />
                </div>

                {needsCpf === true ? (
                  <div className="space-y-2 rounded-lg border border-amber-500/35 bg-amber-50/60 dark:bg-amber-950/20 p-4">
                    <Label htmlFor="checkout-cpf">CPF ou CNPJ *</Label>
                    <p className="text-xs text-muted-foreground leading-snug">
                      O documento é obrigatório para emitir a cobrança no gateway de pagamento. Se você já possui CPF
                      cadastrado neste telefone, esta etapa não aparece.
                    </p>
                    <Input
                      id="checkout-cpf"
                      value={customerCpfCnpj}
                      onChange={(e) => setCustomerCpfCnpj(e.target.value)}
                      required
                      maxLength={18}
                      autoComplete="off"
                      inputMode="numeric"
                      placeholder="Somente números ou com máscara"
                    />
                  </div>
                ) : needsCpf === false ? (
                  <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                    Cadastro localizado com documento. Você pode seguir direto para o pagamento após confirmar seus dados.
                  </p>
                ) : null}

                {submitError && (
                  <p className="text-sm text-destructive" role="alert">
                    {submitError}
                  </p>
                )}

                <Separator />

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando pedido e fatura…
                    </>
                  ) : (
                    "Continuar para pagamento"
                  )}
                </Button>
                <p className="text-[11px] text-center text-muted-foreground">
                  Ao continuar, você concorda em compartilhar estes dados com a loja para fins de cobrança e suporte.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Shell>
  );
};

export default StorePublicCheckout;
