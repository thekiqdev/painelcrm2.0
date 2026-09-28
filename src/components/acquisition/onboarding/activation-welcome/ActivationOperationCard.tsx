import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVATION_OPERATION_SUMMARY_TITLE } from './constants';

type Props = {
  trialDays?: number;
  trialLabel?: string | null;
  usersCount: number;
  whatsappChannels?: number;
  compact?: boolean;
  className?: string;
};

export function ActivationOperationCard({
  trialDays,
  trialLabel,
  usersCount,
  whatsappChannels = 1,
  compact = false,
  className,
}: Props) {
  const trialItem =
    trialLabel ??
    (trialDays != null && trialDays >= 1
      ? `${trialDays} ${trialDays === 1 ? 'dia' : 'dias'} para explorar`
      : 'Período de avaliação');

  const items = [
    trialItem,
    `${usersCount} ${usersCount === 1 ? 'usuário incluso' : 'usuários inclusos'}`,
    `${whatsappChannels} canal WhatsApp`,
    'CRM operacional',
    'Automações habilitadas',
    'IA Assist Preview',
  ];

  return (
    <div className={cn('space-y-2', className)}>
      <p className={cn('font-medium text-foreground/90', compact ? 'text-[11px]' : 'text-xs')}>
        {ACTIVATION_OPERATION_SUMMARY_TITLE}
      </p>
      <ul className={cn('flex flex-col', compact ? 'gap-1' : 'gap-1.5')}>
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              'flex items-center gap-2 text-foreground/88',
              compact ? 'text-[11px]' : 'text-xs',
            )}
          >
            <Check className="h-3 w-3 shrink-0 text-primary/90" strokeWidth={2.5} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
