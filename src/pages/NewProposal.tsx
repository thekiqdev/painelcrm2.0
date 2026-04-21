import ProposalCreateForm from "@/components/proposals/ProposalCreateForm";
import { useSearchParams } from "react-router-dom";

/**
 * Página `/proposals/new` — delega ao formulário compartilhado usado também no Chat (painel embutido).
 * Query opcional: `clientId` + `from=client` (perfil cliente) ou `leadId` / `lead_id` (pré-seleciona lead se não houver cliente).
 */
const NewProposal = () => {
  const [searchParams] = useSearchParams();
  const clientId =
    searchParams.get("clientId")?.trim() || searchParams.get("client_id")?.trim() || null;
  const leadId =
    searchParams.get("leadId")?.trim() || searchParams.get("lead_id")?.trim() || null;
  const from = searchParams.get("from")?.trim() ?? "";
  const clientReturnPath =
    from === "client" && clientId ? `/clients/${clientId}/opportunities` : null;

  return (
    <ProposalCreateForm
      initialClientId={clientId}
      initialLeadId={clientId ? null : leadId}
      clientReturnPath={clientReturnPath}
    />
  );
};

export default NewProposal;
