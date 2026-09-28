import { useEffect } from "react";
import ProposalCreateForm from "@/components/proposals/ProposalCreateForm";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCommerceScreenLayout } from "@/components/mobile/MobileCommerceScreenLayout";
import { useMobileShellChrome } from "@/contexts/MobileShellChromeContext";
import { cn } from "@/lib/utils";

/** `/proposals/:proposalId/edit` — mesmo formulário e hierarquia de botões que `/proposals/new`. */
const EditProposal = () => {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setSuppressMobileBottomNav } = useMobileShellChrome();
  const mobileShell = isMobile;
  const id = proposalId?.trim() ?? "";

  useEffect(() => {
    if (!mobileShell) {
      setSuppressMobileBottomNav(false);
      return;
    }
    setSuppressMobileBottomNav(true);
    return () => setSuppressMobileBottomNav(false);
  }, [mobileShell, setSuppressMobileBottomNav]);

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Proposta inválida.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => navigate("/proposals")}>
          Voltar
        </Button>
      </div>
    );
  }

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
              onClick={() => navigate(`/proposals/${id}`)}
              aria-label="Voltar ao detalhe"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold">Editar proposta</h1>
              <p className="truncate text-xs text-muted-foreground">Salvar rascunho ou publicar</p>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className={cn(mobileShell && "px-2 pt-1")}>
        <ProposalCreateForm editProposalId={id} />
      </div>
    </MobileCommerceScreenLayout>
  );
};

export default EditProposal;
