import { useEffect, useRef, useState, type ReactNode } from "react";

type DeferWhenVisibleProps = {
  children: ReactNode;
  /** Reserva espaço antes do carregamento para reduzir CLS. */
  minHeight?: string;
  rootMargin?: string;
};

/**
 * Só monta `children` quando o bloco entra (quase) no viewport — reduz JS inicial da landing.
 */
export function DeferWhenVisible({
  children,
  minHeight = "18rem",
  rootMargin = "180px 0px",
}: DeferWhenVisibleProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : minHeight }}>
      {visible ? (
        children
      ) : (
        <div className="rounded-lg bg-muted/5" style={{ minHeight }} aria-hidden="true" />
      )}
    </div>
  );
}
