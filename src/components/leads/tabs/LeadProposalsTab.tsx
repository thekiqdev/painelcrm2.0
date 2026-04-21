import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Loader2, Plus } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
}

const LeadProposalsTab: React.FC<LeadProposalsTabProps> = ({
  leadId,
  migratedClientId,
  leadName,
  onCreateProposal,
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
    enabled: Boolean(leadId?.trim()),
  });
  const error = queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  return (
    <TabsContent value="proposals">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h3 className="text-lg font-medium">Propostas</h3>
            <p className="text-sm text-muted-foreground">
              Propostas vinculadas a <strong className="font-medium text-foreground">{leadName}</strong>.
              {cid
                ? " Inclui também as que já estão no cliente CRM após a conversão."
                : " Ao converter o lead em cliente, as propostas do lead passam para o cliente."}
            </p>
          </div>
          <Button type="button" onClick={onCreateProposal} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Criar proposta
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando propostas…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm mb-4">Nenhuma proposta para este lead ainda.</p>
            <Button type="button" variant="outline" onClick={onCreateProposal}>
              <Plus className="mr-2 h-4 w-4" />
              Criar proposta
            </Button>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
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
        )}
      </div>
    </TabsContent>
  );
};

export default LeadProposalsTab;
