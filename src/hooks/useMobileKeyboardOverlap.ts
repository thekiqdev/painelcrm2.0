import { useEffect, useState } from "react";

/**
 * Heurística para quando o teclado virtual provavelmente está visível (viewport mais baixo).
 * Esconde barras inferiores fixas para não colidir com o teclado.
 */
export function useMobileKeyboardOverlap(): boolean {
  const [overlap, setOverlap] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const baseline = Math.max(window.innerHeight, vv.height);
    const threshold = baseline * 0.72;

    const update = () => {
      setOverlap(vv.height < threshold);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return overlap;
}
