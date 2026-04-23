import ProposalCreateForm from "@/components/proposals/ProposalCreateForm";
import { useSearchParams } from "react-router-dom";

/**
 * Página `/proposals/new` — delega ao formulário compartilhado usado também no Chat (painel embutido).
 * Query opcional: `clientId` + `from=client` (perfil cliente), `leadId` + `from=lead` (perfil lead), ou só `leadId` (pré-seleção).
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
  const lockClientPicker = from === "client" && Boolean(clientId);
  const lockLeadPicker = from === "lead" && Boolean(leadId) && !clientId;

  return (
    <ProposalCreateForm
      initialClientId={clientId}
      initialLeadId={clientId ? null : leadId}
      clientReturnPath={clientReturnPath}
      lockClientPicker={lockClientPicker}
      lockLeadPicker={lockLeadPicker}
    />
  );
};

export default NewProposal;
