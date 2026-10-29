import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceOrderForm } from "@/components/service-orders/ServiceOrderForm";
import { MobileCommerceScreenLayout } from "@/components/mobile/MobileCommerceScreenLayout";
import { toast } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileShellChrome } from "@/contexts/MobileShellChromeContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { cn } from "@/lib/utils";
import { serviceOrdersService } from "@/services/serviceOrders";
import type { CreateServiceOrderInput } from "@/types/serviceOrders";

export default function NewServiceOrder() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setSuppressMobileBottomNav } = useMobileShellChrome();
  const { canCreate } = useModulePermissions();
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);

  const clientId =
    searchParams.get("clientId")?.trim() || searchParams.get("client_id")?.trim() || null;
  const from = searchParams.get("from")?.trim() ?? "";
  const lockClientPicker = from === "client" && Boolean(clientId);
  const backPath = useMemo(
    () => (from === "client" && clientId ? `/clients/${clientId}` : "/service-orders"),
    [from, clientId],
  );

  useEffect(() => {
    if (!isMobile) {
      setSuppressMobileBottomNav(false);
      return;
    }
    setSuppressMobileBottomNav(true);
    return () => setSuppressMobileBottomNav(false);
  }, [isMobile, setSuppressMobileBottomNav]);

  if (!canCreate("service_orders")) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Sem permissão para criar ordens de serviço.</p>
        <Button className="mt-3" variant="outline" onClick={() => navigate("/service-orders")}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <MobileCommerceScreenLayout
      enabled={isMobile}
      className={cn(isMobile && "fixed inset-0 z-[40]")}
      header={
        isMobile ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate(backPath)} aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="truncate text-base font-semibold">Nova ordem de serviço</h1>
          </div>
        ) : undefined
      }
    >
      <div
        className={cn(
          "mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8",
          isMobile && "px-3 pt-1",
        )}
      >
        {!isMobile ? (
          <div className="mb-4 flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate(backPath)} aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-semibold md:text-2xl">Nova ordem de serviço</h1>
          </div>
        ) : null}

        <ServiceOrderForm
          mode="create"
          initialClientId={clientId}
          lockClientPicker={lockClientPicker}
          submitting={submitting}
          onCancel={() => navigate(backPath)}
          onSubmit={async (payload) => {
            setSubmitting(true);
            try {
              const created = await serviceOrdersService.create(payload as CreateServiceOrderInput);
              toast.success(`OS Nº ${created.service_order_number} criada`);
              navigate(`/service-orders/${created.id}`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Falha ao criar OS");
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </div>
    </MobileCommerceScreenLayout>
  );
}
