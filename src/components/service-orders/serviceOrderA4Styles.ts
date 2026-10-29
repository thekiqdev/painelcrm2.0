import { cn } from "@/lib/utils";

/** A4 a 96dpi — largura/altura fixas para escala sem reflow (fiel ao PDF). */
export const SERVICE_ORDER_A4_WIDTH_PX = 794;
export const SERVICE_ORDER_A4_HEIGHT_PX = 1123;

/** Folha A4 da OS (largura fluida — preferir `SERVICE_ORDER_A4_SHEET_FIXED_CLASS` + ScaledA4Viewport). */
export const SERVICE_ORDER_A4_SHEET_CLASS = cn(
  "os-a4-sheet w-full max-w-[210mm] min-h-[297mm] bg-white text-[12px] leading-[1.35]",
  "shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-black/[0.06]",
  "px-[12mm] py-[12mm] sm:px-[14mm] sm:py-[14mm]",
  "text-zinc-950 [font-family:Arial,Helvetica,sans-serif]",
  "[color-scheme:light]",
);

/** Folha A4 com medidas fixas (sem breakpoints) — usar dentro de ScaledA4Viewport. */
export const SERVICE_ORDER_A4_SHEET_FIXED_CLASS = cn(
  "os-a4-sheet box-border bg-white text-[12px] leading-[1.35]",
  "w-[794px] min-h-[1123px]",
  "shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-black/[0.06]",
  "px-[53px] py-[53px]",
  "text-zinc-950 [font-family:Arial,Helvetica,sans-serif]",
  "[color-scheme:light]",
);

export const SERVICE_ORDER_A4_INNER_CSS = `
.os-a4-doc { color: #111; }
.os-header { display: grid; grid-template-columns: 1fr auto; gap: 12px; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 12px; }
.os-brand { font-size: 20px; font-weight: 700; letter-spacing: .02em; margin: 0 0 4px; }
/* Snapshots antigos: com logo, não repetir o nome da empresa */
.os-header-brand:has(.os-logo) .os-brand { display: none !important; }
.os-meta { color: #444; font-size: 11px; }
.os-meta div { margin: 1px 0; }
.os-title-row { display: flex; justify-content: space-between; align-items: baseline; margin: 14px 0 12px; border-bottom: 1px solid #222; padding-bottom: 6px; }
.os-title-row h1 { margin: 0; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.os-section { margin: 12px 0; }
.os-section-title { margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #999; padding-bottom: 2px; }
.os-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
.os-lbl { color: #444; font-weight: 600; margin-right: 4px; }
.os-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px; }
.os-table th, .os-table td { border: 1px solid #555; padding: 4px 6px; text-align: left; }
.os-table th { background: #f3f3f3; font-weight: 700; text-transform: uppercase; font-size: 10px; }
.os-table tfoot td { font-weight: 700; background: #fafafa; }
.os-totals { margin-top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 12px; }
.os-grand { font-size: 14px; font-weight: 700; margin-top: 4px; border-top: 1px solid #222; padding-top: 4px; }
.os-obs { min-height: 36px; border: 1px solid #999; padding: 8px; white-space: pre-wrap; }
.os-signs { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 36px; padding-top: 8px; }
.os-sig { text-align: center; font-size: 11px; color: #444; }
.os-sig-line { border-top: 1px solid #222; margin: 48px 12px 6px; }
`;
