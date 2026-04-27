import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ContractCreateForm from "@/components/contracts/ContractCreateForm";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCommerceScreenLayout } from "@/components/mobile/MobileCommerceScreenLayout";
import { cn } from "@/lib/utils";
import { parseClientsListReturnPath } from "@/lib/clientsListRestore";

/**
 * Rotas `/contracts/new` e `/contracts/:id/edit` — delegam ao formulário compartilhado
 * usado também no Chat (painel embutido).
 */
export default function NewContract() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const clientId =
    searchParams.get("clientId")?.trim() || searchParams.get("client_id")?.trim() || null;
  const returnToConversation = searchParams.get("return_to")?.trim() || "";
  const originChat = searchParams.get("origin") === "chat";
  const listReturnPath = useMemo(
    () => parseClientsListReturnPath(searchParams.get("return_path")),
    [searchParams],
  );
  const mobileShell = isMobile;
  const mobileBackPath = returnToConversation || listReturnPath || "/contracts";

  return (
    <MobileCommerceScreenLayout
      enabled={mobileShell}
      className={cn(mobileShell && "fixed inset-0 z-[40]")}
      header={
        mobileShell ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => navigate(mobileBackPath)}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold">{id ? "Editar contrato" : "Novo contrato"}</h1>
              {originChat && returnToConversation ? (
                <p className="truncate text-xs text-muted-foreground">Após criar, pode voltar à conversa</p>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className={cn(mobileShell && "px-2 pt-1")}>
        <ContractCreateForm
          contractId={id}
          initialClientId={clientId}
          listReturnPath={listReturnPath}
          onCreated={
            originChat && returnToConversation
              ? (contract) => {
                  navigate(`/contracts/${contract.id}`, {
                    state: { chatReturnTo: returnToConversation },
                  });
                }
              : undefined
          }
        />
      </div>
    </MobileCommerceScreenLayout>
  );
}
