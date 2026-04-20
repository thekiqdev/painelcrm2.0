import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { contractsService } from "@/services/contracts";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  Search,
  MoreVertical,
  FileText,
  Download,
  Send,
  Copy,
  Trash2,
  Play,
  Square,
  XCircle,
  Calendar as CalendarIcon,
  Filter,
} from "lucide-react";
import type { Contract, ContractStatus, ContractFilters } from "@/types/contracts";
import { getContractDocumentHtml } from "@/utils/contractDocument";
import { canDeleteContractStatus } from "@/utils/contractStatusUi";

const Contracts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canDeleteRecord } = useModulePermissions();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<ContractFilters>({
    status: 'all',
    dateType: 'created',
    startDate: null,
    endDate: null,
    clientId: null,
    responsibleId: null,
    tags: [],
    search: '',
  });
  const [sortField, setSortField] = useState<'updated_at' | 'title' | 'contract_number'>('updated_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (user) {
      loadContracts();
    }
  }, [user]);

  const loadContracts = async () => {
    try {
      setLoading(true);
      
      const data = await contractsService.getContracts({
        status: filters.status !== 'all' ? filters.status : undefined,
        clientId: filters.clientId || undefined,
        responsibleId: filters.responsibleId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        search: filters.search || undefined,
        sortField: sortField,
        sortDirection: sortDirection,
      });

      setContracts(data);
    } catch (error) {
      console.error('Error loading contracts:', error);
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAction = async (action: 'activate' | 'inactivate' | 'cancel' | 'duplicate') => {
    if (selectedIds.length === 0) {
      toast.error('Selecione pelo menos um contrato');
      return;
    }

    try {
      if (action === 'duplicate') {
        for (const id of selectedIds) {
          const original = contracts.find(c => c.id === id);
          if (original) {
            await contractsService.createContract({
              title: `${original.title} (Cópia)`,
              client_id: original.client_id || undefined,
              responsible_id: original.responsible_id || undefined,
              status: 'DRAFT',
              content: original.content || undefined,
              content_html: getContractDocumentHtml(original) || undefined,
              tags: original.tags,
            });
          }
        }
        toast.success('Contratos duplicados com sucesso');
      } else {
        const statusMap = {
          activate: 'ACTIVE',
          inactivate: 'INACTIVE',
          cancel: 'CANCELLED',
        };

        for (const id of selectedIds) {
          await contractsService.updateContract(id, {
            status: statusMap[action] as ContractStatus,
          });
        }
        toast.success('Contratos atualizados com sucesso');
      }

      setSelectedIds([]);
      loadContracts();
    } catch (error) {
      console.error('Error in bulk action:', error);
      toast.error('Erro ao executar ação em massa');
    }
  };

  const getStatusBadge = (status: ContractStatus) => {
    const variants: Record<ContractStatus, { color: string; label: string }> = {
      DRAFT: { color: 'bg-gray-500', label: 'Rascunho' },
      PENDING_SIGNATURE: { color: 'bg-yellow-500', label: 'Pendente' },
      PARTIALLY_SIGNED: { color: 'bg-blue-500', label: 'Parcial' },
      ACTIVE: { color: 'bg-green-500', label: 'Ativo' },
      INACTIVE: { color: 'bg-gray-400', label: 'Inativo' },
      EXPIRED: { color: 'bg-red-500', label: 'Expirado' },
      CANCELLED: { color: 'bg-red-600', label: 'Cancelado' },
    };

    const { color, label } = variants[status];
    return <Badge className={color}>{label}</Badge>;
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const canDeleteContractInUi = (contract: Contract): boolean =>
    canDeleteContractStatus(contract.status) &&
    canDeleteRecord("contracts", contract.responsible_id || contract.user_id, user?.id);

  const handleDeleteContract = async (contract: Contract) => {
    if (!canDeleteContractInUi(contract)) return;
    if (!confirm(`Excluir definitivamente o contrato "${contract.title}"?`)) return;
    try {
      await contractsService.deleteContract(contract.id);
      toast.success("Contrato excluído com sucesso");
      await loadContracts();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro ao excluir contrato";
      toast.error(msg);
    }
  };

  useEffect(() => {
    if (user) loadContracts();
  }, [sortField, sortDirection]);

  const toggleSelectAll = () => {
    if (selectedIds.length === contracts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contracts.map(c => c.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Contratos</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/contracts/templates")}>
            <FileText className="mr-2 h-4 w-4" />
            Modelos
          </Button>
          <Button onClick={() => navigate('/contracts/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Contrato
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filtros</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select
            value={filters.status}
            onValueChange={(value) => setFilters({ ...filters, status: value as ContractStatus | 'all' })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="DRAFT">Rascunho</SelectItem>
              <SelectItem value="PENDING_SIGNATURE">Pendente</SelectItem>
              <SelectItem value="PARTIALLY_SIGNED">Parcial</SelectItem>
              <SelectItem value="ACTIVE">Ativo</SelectItem>
              <SelectItem value="INACTIVE">Inativo</SelectItem>
              <SelectItem value="EXPIRED">Expirado</SelectItem>
              <SelectItem value="CANCELLED">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.dateType}
            onValueChange={(value) => setFilters({ ...filters, dateType: value as 'created' | 'validity' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">Data de Criação</SelectItem>
              <SelectItem value="validity">Período de Vigência</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.startDate ? format(new Date(filters.startDate), 'P', { locale: ptBR }) : 'Data Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.startDate ? new Date(filters.startDate) : undefined}
                onSelect={(date) => setFilters({ ...filters, startDate: date ? date.toISOString() : null })}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.endDate ? format(new Date(filters.endDate), 'P', { locale: ptBR }) : 'Data Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.endDate ? new Date(filters.endDate) : undefined}
                onSelect={(date) => setFilters({ ...filters, endDate: date ? date.toISOString() : null })}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadContracts}>
            Aplicar Filtros
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setFilters({
              status: 'all',
              dateType: 'created',
              startDate: null,
              endDate: null,
              clientId: null,
              responsibleId: null,
              tags: [],
              search: '',
            })}
          >
            Limpar
          </Button>
        </div>
      </div>

      {/* Search and Bulk Actions */}
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, número ou cliente..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && loadContracts()}
            className="pl-10"
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('activate')}>
              <Play className="mr-2 h-4 w-4" />
              Ativar ({selectedIds.length})
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('inactivate')}>
              <Square className="mr-2 h-4 w-4" />
              Inativar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('cancel')}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('duplicate')}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.length === contracts.length && contracts.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('contract_number')}
              >
                Nº Contrato {sortField === 'contract_number' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('title')}
              >
                Título {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('updated_at')}
              >
                Atualizado {sortField === 'updated_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="w-12">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : contracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="text-muted-foreground">
                    Nenhum contrato encontrado.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contracts.map((contract) => (
                <TableRow
                  key={contract.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/contracts/${contract.id}`)}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(contract.id)}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedIds([...selectedIds, contract.id]);
                        } else {
                          setSelectedIds(selectedIds.filter(id => id !== contract.id));
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{contract.contract_number}</TableCell>
                  <TableCell className="font-medium">{contract.title}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={contract.client_name || "—"}>
                    {contract.client_name || "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={contract.responsible_display_name || contract.creator_display_name || "—"}>
                    {contract.responsible_display_name || contract.creator_display_name || "—"}
                  </TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell>
                    {contract.start_date ? format(new Date(contract.start_date), 'dd/MM/yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    {contract.end_date ? format(new Date(contract.end_date), 'dd/MM/yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    {format(new Date(contract.updated_at), 'dd/MM/yyyy HH:mm')}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/contracts/${contract.id}`)}>
                          <FileText className="mr-2 h-4 w-4" />
                          Ver/Editar
                        </DropdownMenuItem>
                        {contract.status === 'DRAFT' && (
                          <DropdownMenuItem
                            onClick={() => navigate(`/contracts/${contract.id}/edit`)}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Editar e enviar para assinatura
                          </DropdownMenuItem>
                        )}
                        {String(contract.content_snapshot_html || "").trim() && (
                          <DropdownMenuItem
                            onClick={() => void contractsService.downloadContractPdf(contract.id)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Baixar PDF
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              const nc = await contractsService.createContract({
                                title: `${contract.title} (Cópia)`,
                                client_id: contract.client_id || undefined,
                                responsible_id: contract.responsible_id || undefined,
                                template_id: contract.template_id || undefined,
                                status: 'DRAFT',
                                content: contract.content || undefined,
                                content_html: getContractDocumentHtml(contract) || undefined,
                                tags: contract.tags,
                                variables: contract.variables,
                              });
                              toast.success('Contrato duplicado');
                              navigate(`/contracts/${nc.id}`, {
                                state: nc.public_view?.token
                                  ? { publicView: { token: nc.public_view.token } }
                                  : undefined,
                              });
                              loadContracts();
                            } catch (e) {
                              console.error(e);
                              toast.error('Erro ao duplicar contrato');
                            }
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar
                        </DropdownMenuItem>
                        {canDeleteContractInUi(contract) && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => void handleDeleteContract(contract)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir contrato
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Contracts;
