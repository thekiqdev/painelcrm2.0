import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UpcomingPaymentsList } from './UpcomingPaymentsList';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { cn } from '@/lib/utils';

import type { GenerateBillingTarget } from '@/lib/subscriptionBillingGeneration';

type Props = {
  canViewInvoices?: boolean;
  onGenerateBilling?: (target?: GenerateBillingTarget) => void;
  onChangeDue?: () => void;
  className?: string;
};

export function UpcomingPaymentCard({
  canViewInvoices = true,
  onGenerateBilling,
  onChangeDue,
  className,
}: Props) {
  const store = useFinancialEventStore();
  const receipts = store.getUpcomingReceipts();

  if (receipts.length === 0) {
    return (
      <Card className={cn('border shadow-sm', className)}>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Sem recebimentos previstos.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border shadow-sm overflow-hidden', className)}>
      <CardHeader className="bg-muted/30 border-b py-4">
        <CardTitle className="text-base font-medium">Próximos recebimentos</CardTitle>
      </CardHeader>
      <CardContent className="pt-5 pb-5">
        <UpcomingPaymentsList
          canViewInvoices={canViewInvoices}
          onGenerateBilling={onGenerateBilling}
          onChangeDue={onChangeDue}
        />
      </CardContent>
    </Card>
  );
}
