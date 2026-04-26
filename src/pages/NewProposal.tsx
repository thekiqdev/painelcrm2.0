import { useEffect } from "react";
import ProposalCreateForm from "@/components/proposals/ProposalCreateForm";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCommerceScreenLayout } from "@/components/mobile/MobileCommerceScreenLayout";
import { useMobileShellChrome } from "@/contexts/MobileShellChromeContext";
import { cn } from "@/lib/utils";

/**
 * Página `/proposals/new` — delega ao formulário compartilhado usado também no Chat (painel embutido).
 * Query opcional: `clientId` + `from=client` (perfil cliente), `leadId` + `from=lead` (perfil lead), ou só `leadId` (pré-seleção).
 */
const NewProposal = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setSuppressMobileBottomNav } = useMobileShellChrome();
  const [searchParams] = useSearchParams();
  const clientId =
    searchParams.get("clientId")?.trim() || searchParams.get("client_id")?.trim() || null;
  const leadId =
    searchParams.get("leadId")?.trim() || searchParams.get("lead_id")?.trim() || null;
  const from = searchParams.get("from")?.trim() ?? "";
  const returnToConversation = searchParams.get("return_to")?.trim() || "";
  const originChat = searchParams.get("origin") === "chat";
  const clientReturnPath =
    from === "client" && clientId ? `/clients/${clientId}/opportunities` : null;
  const lockClientPicker = from === "client" && Boolean(clientId);
  const lockLeadPicker = from === "lead" && Boolean(leadId) && !clientId;
  const mobileShell = isMobile;

  useEffect(() => {
    if (!mobileShell) {
      setSuppressMobileBottomNav(false);
      return;
    }
    setSuppressMobileBottomNav(true);
    return () => setSuppressMobileBottomNav(false);
  }, [mobileShell, setSuppressMobileBottomNav]);

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
              onClick={() => navigate(returnToConversation || "/proposals")}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold">Nova proposta</h1>
              {originChat && returnToConversation ? (
                <p className="truncate text-xs text-muted-foreground">Após criar, pode voltar à conversa</p>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className={cn(mobileShell && "px-2 pt-1")}>
        <ProposalCreateForm
          initialClientId={clientId}
          initialLeadId={clientId ? null : leadId}
          clientReturnPath={clientReturnPath}
          lockClientPicker={lockClientPicker}
          lockLeadPicker={lockLeadPicker}
          onCreated={
            originChat && returnToConversation
              ? (created) => {
                  navigate(`/proposals/${created.id}`, {
                    state: { chatReturnTo: returnToConversation },
                  });
                }
              : undefined
          }
        />
      </div>
    </MobileCommerceScreenLayout>
  );
};

export default NewProposal;
