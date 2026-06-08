import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WHATSAPP_SETUP_OPTIONS } from './operationBuilderConstants';

export function OperationWhatsappSection() {
  const included = WHATSAPP_SETUP_OPTIONS[0]!;

  return (
    <section className="space-y-2 lg:space-y-3" aria-labelledby="op-wa-heading">
      <h2 id="op-wa-heading" className="text-sm font-semibold text-foreground">
        WhatsApp
      </h2>

      {/* Mobile: card único */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] px-3 py-2.5',
          'lg:hidden',
        )}
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">1 canal incluso</p>
          <p className="text-[10px] text-muted-foreground">Multi canais em breve</p>
        </div>
        <span className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
          Incluso
        </span>
      </div>

      {/* Desktop: 3 colunas compactas */}
      <div className="hidden gap-2 lg:grid lg:grid-cols-3">
        {WHATSAPP_SETUP_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isPrimary = opt.id === 'included';
          return (
            <div
              key={opt.id}
              className={cn(
                'rounded-lg border px-2.5 py-2',
                isPrimary
                  ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
                  : 'border-white/[0.07] bg-white/[0.02] opacity-80',
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn('h-3.5 w-3.5', isPrimary ? 'text-emerald-400' : 'text-muted-foreground')} />
                <p className="text-[11px] font-medium text-foreground">{opt.title}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
