
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
import { MoreVertical, Edit, Plus, UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="cursor-pointer" onClick={() => handleSort("name")}>
            <div className="flex items-center">
              Nome
              <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
            </div>
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("company")}>
            <div className="flex items-center">
              Empresa
              <SortIcon field="company" sortField={sortField} sortDirection={sortDirection} />
            </div>
          </TableHead>
          <TableHead>E-mail</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              Nenhum lead encontrado com os critérios de busca
            </TableCell>
          </TableRow>
        ) : (
          leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell 
                className="cursor-pointer hover:underline"
                onClick={() => handleViewLead(lead)}
              >
                {lead.name}
              </TableCell>
              <TableCell>{lead.company || "-"}</TableCell>
              <TableCell>{lead.email || "-"}</TableCell>
              <TableCell>{lead.source || "Direto"}</TableCell>
              <TableCell>
                <Badge 
                  variant="outline"
                  style={{ 
                    backgroundColor: getStatusVariant(lead.status).color,
                    color: '#fff'
                  }}
                >
                  {lead.status}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Ações</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleEditLead(lead);
                    }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar Lead
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onSelectLeadForTasks(lead);
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Tarefa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      onSelectLeadForConversion(lead);
                    }}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Converter para Cliente
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

export default LeadListTable;
