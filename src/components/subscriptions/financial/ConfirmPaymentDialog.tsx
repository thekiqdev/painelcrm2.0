import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatFinancialAmount } from './financialFormat';
import { financialTodayYmd, formatYmdBrSafe, resolveFinancialTimeZone } from '@/lib/billingSafeDate';
import { focusRingClass } from './FinancialStatCard';
import { cn } from '@/lib/utils';
import { customerInvoicesService } from '@/services/customerInvoices';
import { financialService, type FinancialAccountDto } from '@/services/financial';
import { toast } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';

export type ConfirmPaymentDialogProps = {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amountCents?: number | null;
  dueYmd?: string | null;
  gateway?: string | null;
  timeZone?: string | null;
  onConfirmed?: () => void | Promise<void>;
};

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'card', label: 'Cartão' },
  { value: 'transfer', label: 'Transferência' },
] as const;

function centsFromAmountInput(value: string, fallback: number): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100);
}

function amountInputFromCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function ConfirmPaymentDialog({
  invoiceId,
  open,
  onOpenChange,
  amountCents,
  dueYmd,
  gateway,
  timeZone,
  onConfirmed,
}: ConfirmPaymentDialogProps) {
  const tz = resolveFinancialTimeZone(timeZone);
  const defaultCents = amountCents ?? 0;

  const [receivedAmount, setReceivedAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [paymentDate, setPaymentDate] = useState(() => financialTodayYmd(tz));
  const [financialAccountId, setFinancialAccountId] = useState<string>('__none__');
  const [note, setNote] = useState('');
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReceivedAmount(defaultCents > 0 ? amountInputFromCents(defaultCents) : '');
    setPaymentDate(financialTodayYmd(tz));
    setPaymentMethod('pix');
    setNote('');
  }, [open, defaultCents, tz]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAccountsLoading(true);
    financialService
      .listAccounts({ account_scope: 'business' })
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((a) => a.is_active);
        setAccounts(active);
        if (active.length === 1) {
          setFinancialAccountId(active[0]!.id);
        } else {
          setFinancialAccountId('__none__');
        }
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleConfirm = async () => {
    if (!invoiceId) return;
    const receivedCents = centsFromAmountInput(receivedAmount, defaultCents);
    if (receivedCents <= 0) {
      toast.error('Informe o valor recebido');
      return;
    }
    if (!paymentDate) {
      toast.error('Informe a data do pagamento');
      return;
    }

    setSaving(true);
    try {
      const accountId = financialAccountId === '__none__' ? null : financialAccountId;
      await customerInvoicesService.confirmManualPayment(invoiceId, {
        financial_account_id: accountId,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        notes: note.trim() || null,
        amount_received_cents: receivedCents,
      });
      toast.success(
        accountId
          ? 'Pagamento confirmado e recebimento lançado no financeiro.'
          : 'Pagamento confirmado manualmente.'
      );
      onOpenChange(false);
      await onConfirmed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao confirmar pagamento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" data-focus-trap-root>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento</DialogTitle>
          <DialogDescription>
            Registre o recebimento sem sair da assinatura. Datas no fuso {tz}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1 text-sm">
          <div className="space-y-1">
            <Label htmlFor="confirm-pay-amount">Valor recebido</Label>
            <Input
              id="confirm-pay-amount"
              inputMode="decimal"
              value={receivedAmount}
              onChange={(e) => setReceivedAmount(e.target.value)}
              placeholder={defaultCents > 0 ? formatFinancialAmount(defaultCents) : '0,00'}
              className={cn('text-lg font-bold tabular-nums', focusRingClass())}
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-pay-date">Data do pagamento</Label>
            <Input
              id="confirm-pay-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={focusRingClass()}
              disabled={saving}
            />
            {dueYmd ? (
              <p className="text-xs text-muted-foreground">Vencimento: {formatYmdBrSafe(dueYmd)}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-pay-method">Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={saving}>
              <SelectTrigger id="confirm-pay-method" className={focusRingClass()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
                {gateway ? (
                  <SelectItem value="gateway">{gateway}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-pay-bank">Banco / instituição financeira</Label>
            <Select
              value={financialAccountId}
              onValueChange={setFinancialAccountId}
              disabled={saving || accountsLoading}
            >
              <SelectTrigger id="confirm-pay-bank" className={focusRingClass()}>
                <SelectValue placeholder={accountsLoading ? 'Carregando contas…' : 'Selecione a conta'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não lançar no financeiro</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Conta que recebeu o pagamento. Com uma única conta cadastrada, ela é selecionada automaticamente.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-pay-note">Observações (opcional)</Label>
            <Textarea
              id="confirm-pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ex.: comprovante enviado por e-mail"
              className={focusRingClass()}
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className={focusRingClass()}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!invoiceId || saving}
            className={cn(focusRingClass())}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirmando…
              </>
            ) : (
              'Confirmar pagamento'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
