import { useEffect, useState } from 'react';

/**
 * Estima a sobreposição do teclado virtual (px) na parte inferior do layout,
 * usando VisualViewport, para elevar elementos fixos/sticky (ex.: composer do chat).
 */
export function useVisualKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(overlap);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return inset;
}
