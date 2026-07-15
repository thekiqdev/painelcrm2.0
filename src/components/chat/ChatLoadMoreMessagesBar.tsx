/**
 * F6.1 — botão / estado visual de Load More no topo da thread.
 */

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ChatLoadMoreMessagesBarProps = {
  visible: boolean;
  loading: boolean;
  disabled?: boolean;
  onLoadMore: () => void;
  className?: string;
};

/** Barra "Carregar mensagens anteriores" — Idle / Loading / oculto (No More). */
export function ChatLoadMoreMessagesBar({
  visible,
  loading,
  disabled,
  onLoadMore,
  className,
}: ChatLoadMoreMessagesBarProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center py-2 md:py-3',
        className,
      )}
      data-testid="chat-load-more-bar"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || loading}
        onClick={onLoadMore}
        className="h-8 gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        data-testid="chat-load-more-button"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Carregando…
          </>
        ) : (
          'Carregar mensagens anteriores'
        )}
      </Button>
    </div>
  );
}
