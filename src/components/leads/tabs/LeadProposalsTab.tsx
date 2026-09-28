import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, DollarSign, FileText, Loader2, Percent, Plus, Send, Trophy } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { proposalsService, type Proposal } from "@/services/proposals";

const STATUS_LABELS: Record<Proposal["status"], string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Recusada",
  expired: "Expirada",
  invoiced: "Faturada",
};

const STATUS_CLASS: Record<Proposal["status"], string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
  accepted: "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-100",
  rejected: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-100",
  expired: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-100",
  invoiced: "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100",
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatPercent(n: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n)}%`;
}

function proposalStatusGroup(status: string): "draft" | "sent" | "accepted" | "lost" {
  const s = String(status || "").toLowerCase();
  if (["accepted", "approved", "won", "signed", "invoiced"].includes(s)) return "accepted";
  if (["rejected", "declined", "lost", "expired", "cancelled", "canceled"].includes(s)) return "lost";
  if (["sent", "viewed", "pending"].includes(s)) return "sent";
  return "draft";
}

function ProposalMetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-muted/10 shadow-sm md:border-border/70 md:bg-muted/15">
      <CardContent className="p-2.5 md:p-3">
        <div className="flex items-start justify-between gap-1.5">
          <p className="text-[10px] font-medium leading-tight text-muted-foreground md:text-xs">{label}</p>
          <span className="shrink-0 text-muted-foreground opacity-80 [&>svg]:h-3.5 [&>svg]:w-3.5 md:[&>svg]:h-4 md:[&>svg]:w-4">
            {icon}
          </span>
        </div>
        <p className="mt-0.5 text-base font-semibold tabular-nums tracking-tight md:mt-1 md:text-lg">{value}</p>
        {hint ? (
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground md:text-[11px]">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function mergeProposalsById(byLead: Proposal[], byClient: Proposal[]): Proposal[] {
  const map = new Map<string, Proposal>();
  for (const p of byLead) map.set(p.id, p);
  for (const p of byClient) map.set(p.id, p);
  return [...map.values()].sort((a, b) =>
    String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")),
  );
}

interface LeadProposalsTabProps {
  leadId: string;
  migratedClientId?: string | null;
  leadName: string;
  onCreateProposal: () => void;
  canViewProposal?: boolean;
  canCreateProposal?: boolean;
}

const LeadProposalsTab: React.FC<LeadProposalsTabProps> = ({
  leadId,
  migratedClientId,
  leadName,
  onCreateProposal,
  canViewProposal = true,
  canCreateProposal = true,
}) => {
  const cid = migratedClientId?.trim() ?? "";

  const {
    data: rows = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["proposals", "lead-popup", leadId, cid],
    queryFn: async () => {
      const byLead = await proposalsService.getProposals({ lead_id: leadId });
      if (cid.length > 0) {
        const byClient = await proposalsService.getProposals({ client_id: cid });
        return mergeProposalsById(byLead, byClient);
      }
      return byLead;
    },
    enabled: Boolean(leadId?.trim()) && canViewProposal,
  });
  const error = queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;
  const summary = React.useMemo(() => {
    const total = rows.length;
    let sent = 0;
    let accepted = 0;
    let lost = 0;
    let totalValue = 0;
    let acceptedValue = 0;

    for (const proposal of rows) {
      const amount = Number(proposal.amount ?? 0);
      const group = proposalStatusGroup(String(proposal.status));
      totalValue += Number.isFinite(amount) ? amount : 0;
      if (group === "sent") sent++;
      if (group === "accepted") {
        accepted++;
        acceptedValue += Number.isFinite(amount) ? amount : 0;
      }
      if (group === "lost") lost++;
    }

    const conversionBase = sent + accepted + lost;
    const conversionRate = conversionBase > 0 ? (accepted / conversionBase) * 100 : 0;
    return { total, sent, accepted, lost, totalValue, acceptedValue, conversionRate };
  }, [rows]);

  return (
    <TabsContent value="proposals">
      <div className="space-y-3 md:space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight md:text-lg md:font-medium">Propostas</h3>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground md:text-sm md:leading-normal">
              <span className="line-clamp-2 md:line-clamp-none">
                Propostas de <strong className="font-medium text-foreground">{leadName}</strong>.
                {cid
                  ? " Inclui também as do cliente CRM após conversão."
                  : " Ao converter o lead, as propostas seguem para o cliente."}
              </span>
            </p>
          </div>
          <Button
            type="button"
            onClick={onCreateProposal}
            className="h-9 shrink-0 text-xs md:h-10 md:text-sm"
            disabled={!canCreateProposal}
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar proposta
          </Button>
        </div>

        {!canViewProposal ? (
          <div className="rounded-xl border border-dashed border-border/70 p-5 text-center text-sm text-muted-foreground md:p-6">
            Sem permissão para visualizar propostas deste lead.
          </div>
        ) : null}

        {canViewProposal && !error ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-2 lg:grid-cols-4">
            <ProposalMetricCard
              label="Total"
              value={summary.total}
              hint={`${summary.sent} enviadas`}
              icon={<FileText className="h-4 w-4" />}
            />
            <ProposalMetricCard
              label="Aceitas"
              value={summary.accepted}
              hint={`${summary.lost} recusadas/expiradas`}
              icon={<Trophy className="h-4 w-4" />}
            />
            <ProposalMetricCard
              label="Valor total"
              value={formatMoney(summary.totalValue)}
              hint={`Aceito: ${formatMoney(summary.acceptedValue)}`}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <ProposalMetricCard
              label="Conversão"
              value={formatPercent(summary.conversionRate)}
              hint="Aceitas sobre enviadas/encerradas"
              icon={<Percent className="h-4 w-4" />}
            />
            <ProposalMetricCard
              label="Enviadas"
              value={summary.sent}
              hint="Aguardando resposta"
              icon={<Send className="h-4 w-4" />}
            />
            <ProposalMetricCard
              label="Recusadas/expiradas"
              value={summary.lost}
              hint="Status perdidos"
              icon={<Ban className="h-4 w-4" />}
            />
            <ProposalMetricCard
              label="Valor aceito"
              value={formatMoney(summary.acceptedValue)}
              hint="Aceitas/aprovadas"
              icon={<Trophy className="h-4 w-4" />}
            />
          </div>
        ) : null}

        {canViewProposal && loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando propostas…
          </div>
        ) : canViewProposal && error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : canViewProposal && rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-muted-foreground md:p-8">
            <FileText className="mx-auto mb-3 h-9 w-9 opacity-50 md:h-10 md:w-10" />
            <p className="mb-4 text-sm">Nenhuma proposta para este lead ainda.</p>
            <Button type="button" variant="outline" size="sm" className="md:size-default" onClick={onCreateProposal} disabled={!canCreateProposal}>
              <Plus className="mr-2 h-4 w-4" />
              Criar proposta
            </Button>
          </div>
        ) : canViewProposal ? (
          <div className="overflow-x-auto rounded-lg border border-border/60 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Atualizado</TableHead>
                  <TableHead className="w-[100px]">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">{p.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_CLASS[p.status]}>
                        {STATUS_LABELS[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[160px] truncate">
                      {p.client_name || p.lead_name || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(p.amount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {p.updated_at
                        ? format(new Date(p.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="link" className="h-auto p-0" asChild>
                        <Link to={`/proposals/${p.id}`}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </TabsContent>
  );
};

export default LeadProposalsTab;
