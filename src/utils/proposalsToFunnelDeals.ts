import type { Deal, SalesFunnel } from "@/components/funnel/types";
import type { Proposal } from "@/services/proposals";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";

function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDatePt(iso: string | null | undefined): string {
  return formatDateOnlyPtBr(iso);
}

function statusToProbability(status: Proposal["status"]): number {
  switch (status) {
    case "draft":
      return 15;
    case "sent":
      return 45;
    case "accepted":
    case "invoiced":
      return 100;
    case "rejected":
    case "expired":
    default:
      return 0;
  }
}

function resolveStageId(proposal: Proposal, funnels: SalesFunnel[]): string {
  if (proposal.stage_id) return proposal.stage_id;
  if (!proposal.funnel_id) return "";
  const funnel = funnels.find((f) => f.id === proposal.funnel_id);
  if (!funnel?.stages?.length) return "";
  const sorted = [...funnel.stages].sort((a, b) => a.order - b.order);
  return sorted[0]?.id ?? "";
}

/**
 * Converte propostas da API em "deals" usados pelo funil (Kanban / contagem em cards).
 * Propostas sem `funnel_id` ficam com `funnelId` vazio e não entram nos cards por funil.
 */
export function mapProposalsToDeals(
  proposals: Proposal[],
  clientNameById: Map<string, string>,
  funnels: SalesFunnel[]
): Deal[] {
  return proposals.map((p) => {
    const clientLabel = p.client_id ? clientNameById.get(p.client_id) || "Cliente" : "—";
    return {
      id: p.id,
      title: p.title,
      client: clientLabel,
      amount: formatBRL(p.amount),
      probability: statusToProbability(p.status),
      dueDate: formatDatePt(p.valid_until || p.sent_date),
      stage: resolveStageId(p, funnels),
      funnelId: p.funnel_id || "",
    };
  });
}
