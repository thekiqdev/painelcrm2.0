import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import '@/landingpage/landingpage.css';

export type CheckoutAppShellProps = {
  header: React.ReactNode;
  stepper?: React.ReactNode;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  /** Esconde a barra de ações (loaders, erros, pagamento confirmado). */
  hideFooter?: boolean;
  className?: string;
};

/**
 * Shell de viewport fixo para `/checkout` (S1 + S4).
 * Sem Footer/Navbar de marketing — CTAs no rodapé; scroll só no `main`.
 * S4: visualViewport (teclado), scrollIntoView em focus, prefers-reduced-motion.
 */
export function CheckoutAppShell({
  header,
  stepper,
  children,
  footerActions,
  hideFooter = false,
  className,
}: CheckoutAppShellProps) {
  const mainRef = useRef<HTMLElement>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const keyboardOpen = keyboardInset > 80;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.setTimeout(() => {
        target.scrollIntoView({
          block: 'center',
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      }, 50);
    };

    main.addEventListener('focusin', onFocusIn);
    return () => main.removeEventListener('focusin', onFocusIn);
  }, []);

  const showFooter = !hideFooter && !!footerActions && !keyboardOpen;

  return (
    <div
      className={cn(
        'landing-page flex h-[100vh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-background font-sans antialiased',
        'supports-[height:100dvh]:h-[100dvh]',
        className
      )}
      data-keyboard-open={keyboardOpen ? 'true' : undefined}
    >
      <header className="shrink-0 border-b border-border/50 bg-background/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm">
        {header}
      </header>

      {stepper ? (
        <div className="shrink-0 border-b border-border/40 px-4 py-2 sm:px-6">{stepper}</div>
      ) : null}

      <main
        ref={mainRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={
          keyboardOpen
            ? { paddingBottom: Math.max(12, Math.min(keyboardInset, 280)) }
            : undefined
        }
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </main>

      {showFooter ? (
        <footer
          className={cn(
            'shrink-0 border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur-sm',
            'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-6',
            'motion-safe:transition-[transform,opacity] motion-safe:duration-200',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1'
          )}
        >
          <div className="mx-auto w-full max-w-5xl">{footerActions}</div>
        </footer>
      ) : null}
    </div>
  );
}
