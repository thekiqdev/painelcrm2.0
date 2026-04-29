import { useEffect, useState } from 'react';

/**
 * Estima a sobreposição do teclado virtual (px) na parte inferior do layout,
 * usando VisualViewport, para elevar elementos fixos/sticky (ex.: composer do chat).
 *
 * Quando o teclado está fechado, `visualViewport.height` volta perto de `innerHeight`;
 * nesse caso força inset 0 para evitar “resíduo” que empurra o composer (Safari/Chrome mobile).
 */
export function useVisualKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const innerH = window.innerHeight;
      const vvH = vv.height;
      const offsetTop = vv.offsetTop ?? 0;
      // Teclado visível costuma reduzir bastante a altura útil do visual viewport
      const keyboardLikelyOpen = vvH < innerH * 0.78;
      if (!keyboardLikelyOpen) {
        setInset(0);
        return;
      }
      const overlap = Math.max(0, innerH - vvH - offsetTop);
      const maxReasonable = Math.floor(innerH * 0.52);
      setInset(Math.min(overlap, maxReasonable));
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [enabled]);

  return inset;
}
