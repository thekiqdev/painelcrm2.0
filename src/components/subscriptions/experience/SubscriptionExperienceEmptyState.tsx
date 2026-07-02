import { Calendar, CreditCard, LineChart, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ExperienceEmptyKind } from '@/lib/billingSubscriptionExperiencePolish';

type Props = {
  kind: NonNullable<ExperienceEmptyKind>;
  className?: string;
};

const COPY: Record<NonNullable<ExperienceEmptyKind>, { icon: typeof Wallet; title: string; body: string }> = {
  history: {
    icon: Receipt,
    title: 'Sem histórico ainda',
    body: 'Quando a primeira cobrança for gerada, o histórico aparecerá aqui.',
  },
  billing: {
    icon: CreditCard,
    title: 'Sem cobrança gerada',
    body: 'A assinatura está ativa, mas ainda não há faturas emitidas.',
  },
  payment: {
    icon: Wallet,
    title: 'Sem pagamentos',
    body: 'Nenhum pagamento foi confirmado nesta assinatura até o momento.',
  },
  forecast: {
    icon: LineChart,
    title: 'Sem previsão disponível',
    body: 'Não há ciclos futuros para exibir nesta assinatura.',
  },
  calendar: {
    icon: Calendar,
    title: 'Calendário vazio',
    body: 'Os eventos financeiros aparecerão no calendário conforme as cobranças forem agendadas.',
  },
};

export function SubscriptionExperienceEmptyState({ kind, className }: Props) {
  const { icon: Icon, title, body } = COPY[kind];
  return (
    <Card className={cn('border border-dashed bg-muted/10 shadow-none', className)}>
      <CardContent className="flex flex-col items-center justify-center text-center py-12 px-6">
        <div className="rounded-full bg-muted/50 p-4 mb-4" aria-hidden>
          <Icon className="h-8 w-8 text-muted-foreground/70" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{body}</p>
      </CardContent>
    </Card>
  );
}
