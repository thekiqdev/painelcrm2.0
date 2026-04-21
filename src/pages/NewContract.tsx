import { useParams } from "react-router-dom";
import ContractCreateForm from "@/components/contracts/ContractCreateForm";

/**
 * Rotas `/contracts/new` e `/contracts/:id/edit` — delegam ao formulário compartilhado
 * usado também no Chat (painel embutido).
 */
export default function NewContract() {
  const { id } = useParams<{ id: string }>();
  return <ContractCreateForm contractId={id} />;
}
