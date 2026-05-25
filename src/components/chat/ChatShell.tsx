import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ChatShellProps = {
  children: ReactNode;
  /** Banner opcional (ex.: chat plataforma). */
  topBanner?: ReactNode;
  className?: string;
  isMobileConversationView?: boolean;
};

/**
 * Estrutura base do chat — renderiza imediatamente (layout + áreas fixas)
 * enquanto dados hidratam em background (stale-while-revalidate).
 */
export function ChatShell({ children, topBanner, className, isMobileConversationView }: ChatShellProps) {
  return (
    <div
      className={cn(
        'chat-shell flex min-h-0 flex-1 flex-col overflow-hidden max-md:mx-0 max-md:h-full max-md:min-h-0 md:-m-6',
        isMobileConversationView &&
          'fixed inset-0 z-[60] m-0 max-h-[100dvh] h-[100dvh] bg-background',
        !isMobileConversationView &&
          'md:h-[calc(100dvh-var(--app-topbar-height)-var(--chat-page-offset)+var(--chat-extra-height))] md:max-h-[calc(100dvh-var(--app-topbar-height)-var(--chat-page-offset)+var(--chat-extra-height))] md:overflow-hidden md:pb-0',
        className,
      )}
    >
      {topBanner}
      <div className="chat-shell-body flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

/** Placeholder do composer — visível antes de selecionar conversa (UX instantânea). */
export function ChatComposerPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex w-full shrink-0 items-end gap-2 border-t border-border/90 bg-muted/30 p-2 md:px-3 md:py-2',
        className,
      )}
      aria-hidden
    >
      <div className="min-h-12 flex-1 rounded-md border border-border/60 bg-background/80 md:min-h-9" />
      <div className="h-9 w-9 shrink-0 rounded-md bg-muted" />
    </div>
  );
}
