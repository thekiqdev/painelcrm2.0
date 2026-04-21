import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { Loader2, Copy, ExternalLink, QrCode, Banknote, CreditCard } from 'lucide-react';

const BILLING_INTERVALS = [
  { key: 'monthly', label: 'Mensal' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'semi_annual', label: 'Semestral' },
  { key: 'yearly', label: 'Anual' },
] as const;

const PAYMENT_METHODS = [
  { value: 'PIX' as const, label: 'PIX', icon: QrCode, description: 'Pagamento instantâneo' },
  { value: 'BOLETO' as const, label: 'Boleto', icon: Banknote, description: 'Boleto bancário' },
  { value: 'CREDIT_CARD' as const, label: 'Cartão de crédito', icon: CreditCard, description: 'Página segura do gateway' },
] as const;

export interface PlanForPurchase {
  id: string;
  name: string;
  plan_type: 'standard' | 'custom';
  price_cents: number;
  interval_prices?: { billing_interval: string; price_per_user_cents: number }[];
}

interface PlanPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanForPurchase;
  billingInterval?: string;
  usersCount?: number;
  /** Nome da empresa (obrigatório quando não logado) */
  companyName?: string;
  /** Callback após sucesso (ex.: recarregar plano) */
  onSuccess?: () => void;
}

interface PurchaseResult {
  billing_id: string;
  invoice_number?: string;
  amount_cents: number;
  status: string;
  tenant_id: string;
  payment_method?: string;
  invoice_url?: string;
  bank_slip_url?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Grátis';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copiado!'),
    () => toast.error('Não foi possível copiar')
  );
}

export function PlanPurchaseModal({
  open,
  onOpenChange,
  plan,
  billingInterval = 'monthly',
  usersCount = 1,
  companyName = '',
  onSuccess,
}: PlanPurchaseModalProps) {
  const [interval, setInterval] = useState(billingInterval);
  const [users, setUsers] = useState(usersCount);
  const [name, setName] = useState(companyName);
  const [paymentMethod, setPaymentMethod] = useState<'BOLETO' | 'PIX' | 'CREDIT_CARD'>('PIX');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  const isCustom = plan.plan_type === 'custom';
  const prices = plan.interval_prices ?? [];
  const priceRow = prices.find((p) => p.billing_interval === interval);
  const amountCents = isCustom && priceRow ? priceRow.price_per_user_cents * users : plan.price_cents;
  const isLoggedIn = !!apiClient.getToken();

  const runPurchase = async (method: 'BOLETO' | 'PIX' | 'CREDIT_CARD') => {
    if (!isLoggedIn && !name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }
    setPaymentMethod(method);
    setLoading(true);
    setResult(null);
    const body: Record<string, unknown> = {
      plan_id: plan.id,
      billing_interval: interval,
      payment_method: method,
    };
    if (isCustom) body.users_count = users;
    if (!isLoggedIn && name.trim()) body.name = name.trim();

    const res = await apiClient.post<PurchaseResult>('/api/plan-purchase', body);
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) {
      setResult(res.data);
      onSuccess?.();
      toast.success('Cobrança preparada. Siga as instruções abaixo.');
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) setResult(null);
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{result ? 'Pagamento' : `Contratar ${plan.name}`}</DialogTitle>
          <DialogDescription>
            {result
              ? 'Use um dos links abaixo para pagar. Após a confirmação, seu plano será ativado automaticamente.'
              : 'Escolha o intervalo e, em seguida, o método — a cobrança é gerada ou reutilizada na hora.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Fatura <strong>{result.invoice_number ?? result.billing_id}</strong> —{' '}
              {formatPrice(result.amount_cents)}
            </p>
            <p className="text-sm font-medium">Aguardando pagamento</p>

            {result.invoice_url && (
              <div>
                <Button variant="outline" className="w-full gap-2" asChild>
                  <a href={result.invoice_url} target="_blank" rel="noopener noreferrer">
                    Abrir página de pagamento
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            )}
            {result.bank_slip_url && (
              <div>
                <Label className="text-xs text-muted-foreground">Boleto</Label>
                <Button variant="outline" size="sm" className="w-full mt-1 gap-2" asChild>
                  <a href={result.bank_slip_url} target="_blank" rel="noopener noreferrer">
                    Ver boleto
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            )}
            {result.pix_copy_paste && (
              <div>
                <Label className="text-xs text-muted-foreground">PIX Copia e Cola</Label>
                <div className="flex gap-2 mt-1">
                  <Input readOnly value={result.pix_copy_paste} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(result.pix_copy_paste!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {result.pix_qr_code && (
              <div>
                <Label className="text-xs text-muted-foreground">PIX QR Code</Label>
                <div className="mt-1 p-2 bg-white rounded border inline-block">
                  <img src={result.pix_qr_code} alt="QR Code PIX" className="w-32 h-32" />
                </div>
              </div>
            )}

            <Button className="w-full" onClick={() => handleClose(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {!isLoggedIn && (
              <div>
                <Label htmlFor="plan-purchase-name">Nome da empresa</Label>
                <Input
                  id="plan-purchase-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sua empresa"
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <Label>Intervalo de cobrança</Label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {BILLING_INTERVALS.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>

            {isCustom && (
              <div>
                <Label>Quantidade de usuários</Label>
                <Input
                  type="number"
                  min={1}
                  value={users}
                  onChange={(e) => setUsers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Forma de pagamento</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Toque no método — o sistema reutiliza cobrança compatível ou gera automaticamente (como no pagamento de
                faturas).
              </p>
              <div className="mt-2 grid gap-2">
                {PAYMENT_METHODS.map((pm) => {
                  const Icon = pm.icon;
                  const isSelected = paymentMethod === pm.value;
                  const busy = loading && isSelected;
                  return (
                    <button
                      key={pm.value}
                      type="button"
                      disabled={loading}
                      onClick={() => void runPurchase(pm.value)}
                      className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-60 ${
                        isSelected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      <div className={`rounded-full p-2 ${isSelected ? 'bg-primary/20' : 'bg-muted'}`}>
                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{pm.label}</div>
                        <div className="text-[11px] text-muted-foreground">{pm.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-sm font-semibold">{formatPrice(amountCents)}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
