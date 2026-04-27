
import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreVertical, Edit, Plus, UserPlus, Trash2, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveProfileAvatarUrl } from "@/utils/chatIdentityDisplay";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";

type SortIconProps = {
  field: string;
  sortField: string;
  sortDirection: "asc" | "desc";
};

const SortIcon: React.FC<SortIconProps> = ({ field, sortField, sortDirection }) => {
  if (field !== sortField) return null;
  return sortDirection === "asc" ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-1 h-4 w-4"
    >
      <path d="m5 15 7-7 7 7" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ml-1 h-4 w-4"
    >
      <path d="m19 9-7 7-7-7" />
    </svg>
  );
};

const leadStatusBadgeCn =
  "inline-flex max-w-full items-center truncate rounded-md border-0 px-2.5 py-1 text-xs font-medium text-white shadow-sm";

interface LeadListTableProps {
  leads: any[];
  sortField: string;
  sortDirection: "asc" | "desc";
  handleSort: (field: string) => void;
  handleViewLead: (lead: any) => void;
  handleEditLead: (lead: any) => void;
  getStatusVariant: (status: string) => { color: string };
  onSelectLeadForTasks: (lead: any) => void;
  onSelectLeadForConversion: (lead: any) => void;
  onDeleteLead?: (lead: any) => void;
}

const LeadListTable: React.FC<LeadListTableProps> = ({
  leads,
  sortField,
  sortDirection,
  handleSort,
  handleViewLead,
  handleEditLead,
  getStatusVariant,
  onSelectLeadForTasks,
  onSelectLeadForConversion,
  onDeleteLead,
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/60 hover:bg-transparent">
          <TableHead className="w-12" aria-label="Avatar" />
          <TableHead
            className="min-w-[200px] cursor-pointer text-xs font-medium text-muted-foreground"
            onClick={() => handleSort("name")}
          >
            <div className="flex items-center">
              Lead
              <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
            </div>
          </TableHead>
          <TableHead
            className="hidden cursor-pointer md:table-cell md:min-w-[140px] text-xs font-medium text-muted-foreground lg:min-w-[180px]"
            onClick={() => handleSort("company")}
          >
            <div className="flex items-center">
              Empresa
              <SortIcon field="company" sortField={sortField} sortDirection={sortDirection} />
            </div>
          </TableHead>
          <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell md:max-w-[220px]">
            E-mail
          </TableHead>
          <TableHead className="hidden text-xs font-medium text-muted-foreground lg:table-cell lg:max-w-[120px]">
            Origem
          </TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
          <TableHead className="hidden text-xs font-medium text-muted-foreground lg:table-cell whitespace-nowrap">
            Atualizado
          </TableHead>
          <TableHead className="w-[132px] text-right text-xs font-medium text-muted-foreground">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground">
              Nenhum lead encontrado com os critérios de busca
            </TableCell>
          </TableRow>
        ) : (
          leads.map((lead) => {
            const listAvatar = resolveProfileAvatarUrl(lead, lead.whatsapp_avatar_url ?? null);
            const stColor = getStatusVariant(lead.status).color;
            return (
              <TableRow
                key={lead.id}
                className="group/row border-border/40 transition-colors hover:bg-muted/50"
              >
                <TableCell className="w-12 align-middle">
                  <Avatar className="h-9 w-9 ring-1 ring-border/60">
                    {listAvatar.src ? <AvatarImage src={listAvatar.src} alt={lead.name} /> : null}
                    <AvatarFallback className="text-xs">{listAvatar.initials}</AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="align-middle">
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => handleViewLead(lead)}
                  >
                    <span className="font-semibold text-foreground group-hover/row:text-primary">
                      {lead.name}
                    </span>
                    {lead.phone ? (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
                        {lead.phone}
                      </span>
                    ) : null}
                  </button>
                </TableCell>
                <TableCell className="hidden align-middle text-sm text-muted-foreground md:table-cell">
                  <span className="line-clamp-2 max-w-[220px]">{lead.company || "—"}</span>
                </TableCell>
                <TableCell className="hidden align-middle md:table-cell">
                  <span className="line-clamp-2 max-w-[220px] text-sm text-muted-foreground">
                    {lead.email || "—"}
                  </span>
                </TableCell>
                <TableCell className="hidden align-middle lg:table-cell">
                  <span className="text-xs text-muted-foreground">{lead.source || "Direto"}</span>
                </TableCell>
                <TableCell className="align-middle">
                  <Badge
                    variant="outline"
                    className={leadStatusBadgeCn}
                    style={{
                      backgroundColor: stColor,
                      color: "#fff",
                    }}
                  >
                    {lead.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden align-middle text-xs tabular-nums text-muted-foreground lg:table-cell">
                  {lead.updated_at
                    ? formatDateOnlyPtBr(String(lead.updated_at).slice(0, 10))
                    : "—"}
                </TableCell>
                <TableCell className="text-right align-middle" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label="Ver detalhes"
                      onClick={() => handleViewLead(lead)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label="Editar"
                      onClick={() => handleEditLead(lead)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="sm" className="h-8 gap-1 px-2" aria-label="Mais ações">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Mais ações</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectLeadForTasks(lead);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar tarefa
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectLeadForConversion(lead);
                          }}
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Converter para cliente
                        </DropdownMenuItem>
                        {onDeleteLead ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteLead(lead);
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir lead
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
};

export default LeadListTable;
