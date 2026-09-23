import React, { useCallback, useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import { PartnerSectionHeader } from './PartnerSectionHeader';
import { formatBrlCents } from './partnerTypes';
import { usePartnerPanel } from './PartnerPanelContext';

type WholesalePlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  seats_included: number;
  price_cents: number;
  billing_interval: string;
  unit_overage_cents: number | null;
};

type OpenInvoice = {
  id: string;
  amount_cents: number;
  status: string;
  payment_method: string | null;
  billing_reason: string;
  due_date: string | null;
  created_at: string;
};

type WholesaleStatus = {
  wholesale_status: string;
  wholesale_plan_id: string | null;
  wholesale_plan_name: string | null;
  purchased_seats: number;
  used_seats_cache: number;
  plan: WholesalePlan | null;
  paywall_active?: boolean;
  pending_billing: {
    id: string;
    amount_cents: number;
    status: string;
    payment_method: string | null;
    due_date?: string | null;
    billing_reason?: string;
  } | null;
  open_invoices?: OpenInvoice[];
};

type PaymentUrls = {
  invoiceUrl?: string;
  bankSlipUrl?: string;
  bankSlipDigitableLine?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
};

function intervalLabel(i: string): string {
  if (i === 'yearly') return 'ano';
  if (i === 'semi_annual') return 'semestre';
  if (i === 'quarterly') return 'trimestre';
  return 'mês';
}

function reasonLabel(reason: string): string {
  if (reason === 'partner_license_topup') return 'Licenças avulsas';
  return 'Plano atacado';
}

function billingPath(inv: { id: string; billing_reason?: string | null }): string {
  if (inv.billing_reason === 'partner_license_topup') {
    return `/api/partner/licenses/billing/${inv.id}`;
  }
  return `/api/partner/wholesale/billing/${inv.id}`;
}

export default function PartnerWholesalePage() {
  const { reload: refreshPanel } = usePartnerPanel();
  const [plans, setPlans] = useState<WholesalePlan[]>([]);
  const [status, setStatus] = useState<WholesaleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [paymentUrls, setPaymentUrls] = useState<PaymentUrls | null>(null);
  const [billingId, setBillingId] = useState<string | null>(null);
  const [billingReason, setBillingReason] = useState<string>('partner_wholesale');
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([
      apiClient.get<WholesalePlan[]>('/api/partner/wholesale/plans'),
      apiClient.get<WholesaleStatus>('/api/partner/wholesale/status'),
    ]);
    if (!p.error && Array.isArray(p.data)) setPlans(p.data);
    if (!s.error && s.data) {
      setStatus(s.data);
      const first =
        s.data.open_invoices?.[0] ??
        (s.data.pending_billing
          ? {
              id: s.data.pending_billing.id,
              billing_reason: s.data.pending_billing.billing_reason ?? 'partner_wholesale',
            }
          : null);
      if (first?.id) {
        setBillingId(first.id);
        setBillingReason(first.billing_reason || 'partner_wholesale');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!billingId) return;
    let cancelled = false;
    const path =
      billingReason === 'partner_license_topup'
        ? `/api/partner/licenses/billing/${billingId}`
        : `/api/partner/wholesale/billing/${billingId}`;
    const tick = async () => {
      const res = await apiClient.get<{
        billing: { status: string };
        paymentUrls: PaymentUrls | null;
        paid?: boolean;
      }>(path);
      if (cancelled || res.error || !res.data) return;
      if (res.data.paymentUrls) setPaymentUrls(res.data.paymentUrls);
      if (res.data.paid || res.data.billing.status === 'paid') {
        toast.success('Pagamento confirmado — canal liberado');
        setPaymentUrls(null);
        setBillingId(null);
        await load();
        await refreshPanel();
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [billingId, billingReason, load, refreshPanel]);

  const payInvoice = async (inv: OpenInvoice | { id: string; billing_reason?: string }) => {
    setPayingId(inv.id);
    setBillingId(inv.id);
    setBillingReason(inv.billing_reason || 'partner_wholesale');
    setPaymentUrls(null);
    const res = await apiClient.get<{
      billing: { status: string };
      paymentUrls: PaymentUrls | null;
      paid?: boolean;
    }>(billingPath(inv));
    setPayingId(null);
    if (res.error) {
      toast.error(res.error || 'Falha ao carregar cobrança');
      return;
    }
    if (res.data?.paid || res.data?.billing?.status === 'paid') {
      toast.success('Já pago — atualizando…');
      await load();
      await refreshPanel();
      return;
    }
    setPaymentUrls(res.data?.paymentUrls ?? null);
    if (!res.data?.paymentUrls) {
      toast.error('Dados de pagamento ainda indisponíveis — tente de novo em instantes');
    }
  };

  const subscribe = async (planId: string) => {
    setSubscribing(planId);
    const res = await apiClient.post<{
      billing: { id: string; status: string };
      paymentUrls: PaymentUrls | null;
      settled?: boolean;
    }>('/api/partner/wholesale/subscribe', {
      wholesale_plan_id: planId,
      payment_method: 'PIX',
    });
    setSubscribing(null);
    if (res.error) {
      toast.error(res.error || 'Falha ao contratar');
      return;
    }
    if (res.data?.settled || res.data?.billing?.status === 'paid') {
      toast.success('Plano ativado');
      setPaymentUrls(null);
      setBillingId(null);
      await load();
      await refreshPanel();
      return;
    }
    setBillingReason('partner_wholesale');
    setBillingId(res.data?.billing?.id ?? null);
    setPaymentUrls(res.data?.paymentUrls ?? null);
    toast.success('Cobrança gerada — pague via PIX (Asaas Platform)');
    await load();
  };

  const paywall = Boolean(status?.paywall_active);
  const openInvoices = status?.open_invoices ?? [];

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title={paywall ? 'Regularizar pagamento' : 'Plano Platform'}
        description={
          paywall
            ? 'Pague as faturas Platform em aberto para desbloquear crescimento do canal (novos clientes e planos).'
            : 'Contrate o plano atacado cobrado pela Platform (Asaas global). Seu Asaas continua só para clientes finais.'
        }
      />

      {paywall ? (
        <Card className="border-destructive/40 bg-destructive/5 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Canal inadimplente</CardTitle>
            <CardDescription>
              Status <Badge variant="destructive">{status?.wholesale_status}</Badge>
              {status?.wholesale_plan_name ? (
                <>
                  {' '}
                  · plano <strong>{status.wholesale_plan_name}</strong>
                </>
              ) : null}
              . Clientes existentes não são afetados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma fatura aberta encontrada. Se o problema persistir, fale com o Super Admin
                (sincronize past_due ou confira o webhook Asaas).
              </p>
            ) : (
              <ul className="space-y-2">
                {openInvoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {formatBrlCents(inv.amount_cents)} · {reasonLabel(inv.billing_reason)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.status}
                        {inv.due_date ? ` · venc. ${inv.due_date}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={payingId === inv.id}
                      onClick={() => void payInvoice(inv)}
                    >
                      {payingId === inv.id
                        ? 'Carregando…'
                        : billingId === inv.id && paymentUrls
                          ? 'Ver PIX'
                          : 'Pagar'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!paywall && status && !status.wholesale_plan_id ? (
        <Card className="border-primary/30 bg-primary/5 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Escolha o plano Platform</CardTitle>
            <CardDescription>
              Nenhum plano atacado foi atrelado no cadastro. Contrate abaixo para liberar seats e
              crescer o canal.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Situação atual</CardTitle>
          <CardDescription>Vínculo com o catálogo atacado da Platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {loading || !status ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <p>
                Status{' '}
                <Badge variant={paywall ? 'destructive' : 'outline'}>
                  {status.wholesale_status}
                </Badge>
                {status.wholesale_plan_name ? (
                  <>
                    {' '}
                    · <strong>{status.wholesale_plan_name}</strong>
                  </>
                ) : null}
              </p>
              <p className="text-muted-foreground">
                Pool: {status.used_seats_cache} / {status.purchased_seats} licenças
              </p>
              {!paywall && status.pending_billing ? (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                  Cobrança pendente de {formatBrlCents(status.pending_billing.amount_cents)} (
                  {status.pending_billing.status})
                  <Button
                    variant="link"
                    className="ml-2 h-auto px-0 text-xs"
                    onClick={() =>
                      void payInvoice({
                        id: status.pending_billing!.id,
                        billing_reason: status.pending_billing!.billing_reason,
                      })
                    }
                  >
                    Ver pagamento
                  </Button>
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {paymentUrls?.pixCopyPaste || paymentUrls?.pixQrCode || paymentUrls?.invoiceUrl ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Pagar com PIX</CardTitle>
            <CardDescription>
              Gateway Platform — após a confirmação o canal volta a crescer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentUrls.pixQrCode ? (
              <img
                src={
                  paymentUrls.pixQrCode.startsWith('data:')
                    ? paymentUrls.pixQrCode
                    : `data:image/png;base64,${paymentUrls.pixQrCode}`
                }
                alt="QR Code PIX"
                className="mx-auto h-48 w-48 rounded-md border bg-white p-2"
              />
            ) : null}
            {paymentUrls.pixCopyPaste ? (
              <div className="space-y-2">
                <p className="break-all rounded-md bg-muted/50 p-3 font-mono text-xs">
                  {paymentUrls.pixCopyPaste}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(paymentUrls.pixCopyPaste || '');
                    toast.success('Código PIX copiado');
                  }}
                >
                  Copiar código PIX
                </Button>
              </div>
            ) : null}
            {paymentUrls.invoiceUrl ? (
              <Button variant="link" className="px-0" asChild>
                <a href={paymentUrls.invoiceUrl} target="_blank" rel="noreferrer">
                  Abrir fatura no Asaas
                </a>
              </Button>
            ) : null}
            {paymentUrls.bankSlipUrl ? (
              <Button variant="link" className="px-0" asChild>
                <a href={paymentUrls.bankSlipUrl} target="_blank" rel="noreferrer">
                  Abrir boleto
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!paywall ? (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => {
            const isCurrent =
              status?.wholesale_plan_id === plan.id && status.wholesale_status === 'active';
            return (
              <Card key={plan.id} className="border-border/80 shadow-sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        {plan.name}
                      </CardTitle>
                      <CardDescription>
                        {plan.seats_included} licenças / {intervalLabel(plan.billing_interval)}
                      </CardDescription>
                    </div>
                    {isCurrent ? <Badge>Atual</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.description ? (
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                  ) : null}
                  <p className="text-2xl font-semibold tracking-tight">
                    {formatBrlCents(plan.price_cents)}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{intervalLabel(plan.billing_interval)}
                    </span>
                  </p>
                  <Button
                    className="w-full"
                    disabled={isCurrent || subscribing === plan.id}
                    onClick={() => void subscribe(plan.id)}
                  >
                    {isCurrent
                      ? 'Plano ativo'
                      : subscribing === plan.id
                        ? 'Gerando cobrança…'
                        : 'Contratar'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {!loading && plans.length === 0 ? (
            <p className="text-sm text-muted-foreground md:col-span-2">
              Nenhum plano atacado disponível no momento. Fale com o Super Admin.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
