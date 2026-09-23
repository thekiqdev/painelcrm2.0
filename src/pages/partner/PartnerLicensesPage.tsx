import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/entities/StatCard';
import { COMMERCIAL_SUMMARY_GRID_4 } from '@/lib/commercialListUi';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerSectionHeader } from './PartnerSectionHeader';
import { formatBrlCents } from './partnerTypes';

type LedgerRow = {
  id: string;
  delta_seats: number;
  balance_after: number;
  reason: string;
  note: string | null;
  created_at: string;
};

type PaymentUrls = {
  invoiceUrl?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
};

type LicenseApi = {
  purchased_seats: number;
  used_seats: number;
  available_seats: number;
  unit_cost_cents: number;
  topup_unit_price_cents?: number;
  topup_price_source?: string;
  wholesale_status?: string | null;
  floor_price_cents: number | null;
  topup_packs?: Array<{ id: string; qty: number }>;
};

export default function PartnerLicensesPage() {
  const { licenses, reload: refreshPanel } = usePartnerPanel();
  const [licenseApi, setLicenseApi] = useState<LicenseApi | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [qty, setQty] = useState('10');
  const [buying, setBuying] = useState(false);
  const [paymentUrls, setPaymentUrls] = useState<PaymentUrls | null>(null);
  const [billingId, setBillingId] = useState<string | null>(null);

  const unitPrice =
    licenseApi?.topup_unit_price_cents ?? licenses?.unit_cost_cents ?? 0;

  const loadExtras = useCallback(async () => {
    const [lic, led] = await Promise.all([
      apiClient.get<LicenseApi>('/api/partner/licenses'),
      apiClient.get<LedgerRow[]>('/api/partner/licenses/ledger?limit=30'),
    ]);
    if (!lic.error && lic.data) setLicenseApi(lic.data);
    if (!led.error && Array.isArray(led.data)) setLedger(led.data);
  }, []);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  useEffect(() => {
    if (!billingId) return;
    let cancelled = false;
    const tick = async () => {
      const res = await apiClient.get<{
        billing: { status: string };
        paymentUrls: PaymentUrls | null;
        paid?: boolean;
      }>(`/api/partner/licenses/billing/${billingId}`);
      if (cancelled || res.error || !res.data) return;
      if (res.data.paymentUrls) setPaymentUrls(res.data.paymentUrls);
      if (res.data.paid || res.data.billing.status === 'paid') {
        toast.success('Pagamento confirmado — licenças creditadas');
        setPaymentUrls(null);
        setBillingId(null);
        await loadExtras();
        await refreshPanel();
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [billingId, loadExtras, refreshPanel]);

  const pct =
    licenses && licenses.purchased_seats > 0
      ? Math.min(100, Math.round((licenses.used_seats / licenses.purchased_seats) * 100))
      : 0;

  const nearLimit = Boolean(
    licenses && licenses.available_seats <= Math.max(1, Math.floor(licenses.purchased_seats * 0.1))
  );

  const qtyNum = Math.trunc(Number(qty));
  const previewTotal =
    Number.isFinite(qtyNum) && qtyNum > 0 ? unitPrice * qtyNum : 0;

  const purchase = async (overrideQty?: number) => {
    const n = overrideQty ?? qtyNum;
    if (!Number.isInteger(n) || n < 1) {
      toast.error('Informe uma quantidade válida');
      return;
    }
    if (licenseApi?.wholesale_status === 'past_due') {
      toast.error('Plano atacado em atraso — regularize antes de comprar');
      return;
    }
    setBuying(true);
    const res = await apiClient.post<{
      billing: { id: string; status: string };
      quote: { qty: number; amount_cents: number };
      paymentUrls: PaymentUrls | null;
      settled?: boolean;
    }>('/api/partner/licenses/purchase', {
      qty: n,
      payment_method: 'PIX',
    });
    setBuying(false);
    if (res.error) {
      toast.error(res.error || 'Falha na compra');
      return;
    }
    if (res.data?.settled || res.data?.billing?.status === 'paid') {
      toast.success(`+${res.data.quote.qty} licenças creditadas`);
      setPaymentUrls(null);
      setBillingId(null);
      await loadExtras();
      await refreshPanel();
      return;
    }
    setBillingId(res.data?.billing?.id ?? null);
    setPaymentUrls(res.data?.paymentUrls ?? null);
    toast.success('Cobrança gerada — pague via PIX (Platform)');
  };

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Licenças"
        description="Pool operacional e compra avulsa de seats cobrada pela Platform."
      />

      <div className={COMMERCIAL_SUMMARY_GRID_4}>
        <StatCard
          label="Contratadas"
          value={licenses ? String(licenses.purchased_seats) : '—'}
          icon={KeyRound}
        />
        <StatCard
          label="Utilizadas"
          value={licenses ? String(licenses.used_seats) : '—'}
          icon={KeyRound}
          iconClassName="text-crm-primary"
        />
        <StatCard
          label="Disponíveis"
          value={licenses ? String(licenses.available_seats) : '—'}
          icon={KeyRound}
          iconClassName="text-emerald-600"
        />
        <StatCard
          label="Preço avulso"
          value={formatBrlCents(unitPrice)}
          icon={KeyRound}
          iconClassName="text-amber-600"
        />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Consumo</CardTitle>
          <CardDescription>
            {licenses
              ? `${licenses.used_seats} de ${licenses.purchased_seats} licenças em uso`
              : 'Carregando pool…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <p className="text-3xl font-bold tracking-tight">
              {licenses ? `${licenses.used_seats} / ${licenses.purchased_seats}` : '—'}
            </p>
            <p className="text-sm text-muted-foreground">{pct}%</p>
          </div>
          <Progress value={pct} className="h-3" />
          {licenses?.floor_price_cents != null ? (
            <p className="text-xs text-muted-foreground">
              Piso comercial do programa: {formatBrlCents(licenses.floor_price_cents)}
            </p>
          ) : null}
          {nearLimit ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Você está próximo do limite do pool. Compre licenças avulsas abaixo ou contrate um
              plano Platform.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Comprar licenças</CardTitle>
          <CardDescription>
            One-shot via Asaas Platform
            {licenseApi?.topup_price_source === 'wholesale_overage'
              ? ' · preço do plano atacado (overage)'
              : ' · preço unitário do pool'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {licenseApi?.wholesale_status === 'past_due' ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Plano atacado em atraso — compra avulsa bloqueada até regularizar.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {(licenseApi?.topup_packs ?? [
              { id: '10', qty: 10 },
              { id: '50', qty: 50 },
              { id: '100', qty: 100 },
            ]).map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={buying}
                onClick={() => {
                  setQty(String(p.qty));
                  void purchase(p.qty);
                }}
              >
                +{p.qty} · {formatBrlCents(unitPrice * p.qty)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={500}
                className="w-28"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Total estimado</p>
              <p className="font-semibold">{formatBrlCents(previewTotal)}</p>
            </div>
            <Button onClick={() => void purchase()} disabled={buying}>
              {buying ? 'Gerando cobrança…' : 'Comprar'}
            </Button>
          </div>

          {paymentUrls?.pixCopyPaste || paymentUrls?.pixQrCode ? (
            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <p className="text-sm font-medium">Pagar com PIX</p>
              {paymentUrls.pixQrCode ? (
                <img
                  src={
                    paymentUrls.pixQrCode.startsWith('data:')
                      ? paymentUrls.pixQrCode
                      : `data:image/png;base64,${paymentUrls.pixQrCode}`
                  }
                  alt="QR Code PIX"
                  className="mx-auto h-40 w-40 rounded-md border bg-white p-2"
                />
              ) : null}
              {paymentUrls.pixCopyPaste ? (
                <div className="space-y-2">
                  <p className="break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
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
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Histórico do ledger</CardTitle>
          <CardDescription>Grants, ativações de plano e compras avulsas</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {ledger.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                >
                  <span>
                    <Badge variant="outline" className="mr-2 font-mono text-[10px]">
                      {row.reason}
                    </Badge>
                    <span className={row.delta_seats >= 0 ? 'text-emerald-700' : 'text-destructive'}>
                      {row.delta_seats >= 0 ? '+' : ''}
                      {row.delta_seats}
                    </span>
                    <span className="text-muted-foreground"> → saldo {row.balance_after}</span>
                    {row.note ? (
                      <span className="ml-2 text-xs text-muted-foreground">{row.note}</span>
                    ) : null}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(row.created_at).toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
