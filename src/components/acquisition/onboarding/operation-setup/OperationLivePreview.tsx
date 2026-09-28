import { useEffect, useState } from 'react';
import { Bot, Infinity, MessageCircle, Users, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OperationPreviewState } from './operationBuilderState';

type Props = {
  preview: OperationPreviewState;
};

const METRIC_ROW =
  'flex h-[52px] items-center justify-between rounded-xl border border-white/[0.06] bg-black/25 px-3.5';

function AvatarStack({ count }: { count: number }) {
  const shown = Math.min(count, 4);
  const extra = count - shown;

  return (
    <div className="flex -space-x-2">
      {Array.from({ length: shown }).map((_, i) => (
        <div
          key={i}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[hsl(228,32%,6%)] bg-primary/20 text-[10px] font-semibold text-primary"
        >
          {String.fromCharCode(65 + (i % 26))}
        </div>
      ))}
      {extra > 0 ? (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[hsl(228,32%,6%)] bg-white/10 text-[10px] text-muted-foreground">
          +{extra}
        </div>
      ) : null}
    </div>
  );
}

/** Preview operacional desktop — mini dashboard, alturas fixas */
export function OperationLivePreview({ preview }: Props) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setPulse((p) => !p), 2600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.09]',
        'bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4',
        'shadow-[0_0_64px_-24px_hsl(var(--primary)/0.45)] backdrop-blur-xl',
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-primary/15 blur-[48px]"
        aria-hidden
      />

      <div className="relative mb-4 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Preview operacional
        </p>
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full bg-emerald-400/50',
              pulse && 'animate-ping opacity-60',
            )}
          />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
        </span>
      </div>

      <div className="relative flex flex-1 flex-col gap-2.5">
        <div className={METRIC_ROW}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4 text-primary/80" />
            Equipe ativa
          </div>
          <div className="flex items-center gap-2.5">
            <AvatarStack count={preview.usersCount} />
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {preview.usersCount}
            </span>
          </div>
        </div>

        <div className={cn(METRIC_ROW, 'border-emerald-500/20 bg-emerald-500/[0.04]')}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
            WhatsApp conectado
          </div>
          <span className="text-xs font-medium text-emerald-400/95">Preparado</span>
        </div>

        <div className={METRIC_ROW}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Infinity className="h-4 w-4 text-primary/80" />
            Automações
          </div>
          <span className="text-sm font-semibold tabular-nums text-foreground">∞</span>
        </div>

        <div className={cn(METRIC_ROW, 'border-violet-500/20 bg-violet-500/[0.05]')}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="h-4 w-4 text-violet-300" />
            IA Assist
          </div>
          <span className="text-xs font-medium text-violet-300/90">Preview</span>
        </div>

        <div className={METRIC_ROW}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-4 w-4 text-primary/70" />
            Workspace
          </div>
          <span className="max-w-[140px] truncate text-right text-xs font-medium text-foreground/90">
            {preview.planName}
          </span>
        </div>
      </div>
    </div>
  );
}
