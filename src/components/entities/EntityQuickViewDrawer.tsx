import { useCallback } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEntityNavigation } from "@/hooks/useEntityNavigation";
import { useEntityDrawerStore } from "@/stores/entityDrawerStore";
import { ClientQuickView } from "./ClientQuickView";
import { LeadQuickView } from "./LeadQuickView";
import { cn } from "@/lib/utils";

export function EntityQuickViewDrawer() {
  const { isOpen, entityType, entityId, close } = useEntityDrawerStore();
  const isMobile = useIsMobile();
  const { openEntity } = useEntityNavigation();

  const openFullProfile = useCallback(() => {
    if (!entityId || !entityType) return;
    close();
    openEntity(entityType, entityId, { mode: "route" });
  }, [close, entityId, entityType, openEntity]);

  const sheetLabel =
    entityType === "client" ? "Resumo do cliente" : entityType === "lead" ? "Resumo do lead" : "";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        overlayClassName="bg-black/40 backdrop-blur-[3px] dark:bg-black/55"
        className={cn(
          "flex w-full flex-col gap-0 overflow-hidden p-0",
          isMobile
            ? "h-[min(90dvh,720px)] max-h-[90dvh] rounded-t-2xl border-t"
            : "h-full w-full max-w-[460px] sm:max-w-[460px]",
        )}
      >
        <SheetTitle className="sr-only">{sheetLabel}</SheetTitle>
        <SheetDescription className="sr-only">
          Visualização rápida sem sair da página atual
        </SheetDescription>

        {entityType === "client" && entityId ? (
          <ClientQuickView
            key={entityId}
            clientId={entityId}
            onRequestClose={close}
            onOpenFullProfile={openFullProfile}
          />
        ) : null}

        {entityType === "lead" && entityId ? (
          <LeadQuickView
            key={entityId}
            leadId={entityId}
            onRequestClose={close}
            onOpenFullProfile={openFullProfile}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
