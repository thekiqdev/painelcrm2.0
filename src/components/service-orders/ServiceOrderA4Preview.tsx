import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { sanitizeServiceOrderDocumentHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import { serviceOrdersService } from "@/services/serviceOrders";
import {
  SERVICE_ORDER_A4_INNER_CSS,
  SERVICE_ORDER_A4_SHEET_FIXED_CLASS,
} from "@/components/service-orders/serviceOrderA4Styles";
import { ScaledA4Viewport } from "@/components/service-orders/ScaledA4Viewport";

type Props = {
  serviceOrderId: string;
  className?: string;
  /** Incrementar para forçar reload (ex.: após salvar). */
  refreshKey?: number;
};

export function ServiceOrderA4Preview({ serviceOrderId, className, refreshKey = 0 }: Props) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const doc = await serviceOrdersService.getDocument(serviceOrderId);
        if (!cancelled) setHtml(doc.html || "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar documento");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceOrderId, refreshKey]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-16 text-muted-foreground", className)}>
        <Loader2 className="h-5 w-5 animate-spin" /> Gerando preview…
      </div>
    );
  }

  if (error) {
    return <p className={cn("text-sm text-destructive", className)}>{error}</p>;
  }

  return (
    <div className={cn("w-full bg-muted/40 py-4", className)}>
      <ScaledA4Viewport>
        <article className={SERVICE_ORDER_A4_SHEET_FIXED_CLASS}>
          <div
            dangerouslySetInnerHTML={{
              __html: sanitizeServiceOrderDocumentHtml(html || "<p></p>"),
            }}
          />
          <style>{SERVICE_ORDER_A4_INNER_CSS}</style>
        </article>
      </ScaledA4Viewport>
    </div>
  );
}
