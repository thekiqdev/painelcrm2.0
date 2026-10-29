import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SERVICE_ORDER_A4_HEIGHT_PX,
  SERVICE_ORDER_A4_WIDTH_PX,
} from "@/components/service-orders/serviceOrderA4Styles";

type Props = {
  children: ReactNode;
  className?: string;
  /** Largura lógica da folha (px). Default A4. */
  pageWidthPx?: number;
  /** Altura mínima lógica (px) — usada só como fallback até medir o conteúdo. */
  pageMinHeightPx?: number;
};

/**
 * Mostra uma folha A4 em largura fixa e reduz com `transform: scale`,
 * sem reflow responsivo (estrutura idêntica ao PDF).
 */
export function ScaledA4Viewport({
  children,
  className,
  pageWidthPx = SERVICE_ORDER_A4_WIDTH_PX,
  pageMinHeightPx = SERVICE_ORDER_A4_HEIGHT_PX,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(pageMinHeightPx);

  useEffect(() => {
    const outer = outerRef.current;
    const page = pageRef.current;
    if (!outer || !page) return;

    const update = () => {
      const available = outer.clientWidth;
      const nextScale = available > 0 ? Math.min(1, available / pageWidthPx) : 1;
      setScale(nextScale);
      const h = Math.max(page.scrollHeight, pageMinHeightPx);
      setPageHeight(h);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(page);
    return () => ro.disconnect();
  }, [pageWidthPx, pageMinHeightPx]);

  return (
    <div ref={outerRef} className={cn("w-full overflow-x-hidden", className)}>
      <div
        className="relative mx-auto"
        style={{
          width: pageWidthPx * scale,
          height: pageHeight * scale,
        }}
      >
        <div
          ref={pageRef}
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: pageWidthPx,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
