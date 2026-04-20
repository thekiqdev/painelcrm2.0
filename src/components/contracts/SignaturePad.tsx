import React, { forwardRef, useImperativeHandle, useRef, useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

/** Coordenadas lógicas (CSS px); bitmap interno = isto × DPR (máx. 2,5). */
const LOGICAL_W = 560;
const LOGICAL_H = 160;
const MIN_INK_STROKE = 80;
/** Largura máxima do PNG enviado ao servidor (downscale) — alinhado ao teto ~520 KiB no backend. */
const EXPORT_MAX_WIDTH = 440;

export type SignaturePadHandle = {
  clear: () => void;
  hasDrawing: () => boolean;
  /** PNG base64 sem prefixo data URL, ou null se vazio. */
  getPngBase64: () => string | null;
};

type Props = {
  disabled?: boolean;
  className?: string;
  onDrawingChange?: (hasInk: boolean) => void;
};

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { disabled, className, onDrawingChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const strokePixelsRef = useRef(0);

  const layoutCanvas = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2.5);
    el.width = Math.round(LOGICAL_W * dpr);
    el.height = Math.round(LOGICAL_H * dpr);
    el.style.width = "100%";
    el.style.maxWidth = `${LOGICAL_W}px`;
    el.style.height = `${LOGICAL_H}px`;
    el.style.display = "block";
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }, []);

  useEffect(() => {
    layoutCanvas();
  }, [layoutCanvas]);

  const notify = useCallback(
    (ink: boolean) => {
      setHasInk(ink);
      onDrawingChange?.(ink);
    },
    [onDrawingChange]
  );

  const getContext = () => {
    const c = canvasRef.current;
    if (!c) return null;
    return c.getContext("2d");
  };

  const clear = useCallback(() => {
    layoutCanvas();
    strokePixelsRef.current = 0;
    notify(false);
  }, [layoutCanvas, notify]);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      hasDrawing: () => hasInk && strokePixelsRef.current >= MIN_INK_STROKE,
      getPngBase64: () => {
        const src = canvasRef.current;
        if (!src || !hasInk || strokePixelsRef.current < MIN_INK_STROKE) return null;
        const sw = src.width;
        const sh = src.height;
        const scale = Math.min(1, EXPORT_MAX_WIDTH / sw);
        const ew = Math.max(1, Math.round(sw * scale));
        const eh = Math.max(1, Math.round(sh * scale));
        const oc = document.createElement("canvas");
        oc.width = ew;
        oc.height = eh;
        const octx = oc.getContext("2d");
        if (!octx) return null;
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, ew, eh);
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = "high";
        octx.drawImage(src, 0, 0, ew, eh);
        try {
          const dataUrl = oc.toDataURL("image/png");
          const prefix = "data:image/png;base64,";
          if (!dataUrl.startsWith(prefix)) return null;
          return dataUrl.slice(prefix.length);
        } catch {
          return null;
        }
      },
    }),
    [clear, hasInk]
  );

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const scaleX = LOGICAL_W / r.width;
    const scaleY = LOGICAL_H / r.height;
    return {
      x: (e.clientX - r.left) * scaleX,
      y: (e.clientY - r.top) * scaleY,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = getContext();
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = pos(e);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    strokePixelsRef.current += 3;
    if (!hasInk && strokePixelsRef.current >= MIN_INK_STROKE) notify(true);
  };

  const endStroke = () => {
    drawingRef.current = false;
  };

  return (
    <div className={className}>
      <div className="rounded-md border bg-white overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={() => {
            if (drawingRef.current) endStroke();
          }}
        />
      </div>
      <div className="flex justify-end mt-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => clear()}>
          <Eraser className="mr-2 h-4 w-4" />
          Limpar assinatura
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Use o dedo no telemóvel ou o rato no computador. Em ecrãs HD a assinatura é mais nítida; o envio usa uma imagem
        compacta. Traços demasiado curtos não são aceites.
      </p>
    </div>
  );
});
