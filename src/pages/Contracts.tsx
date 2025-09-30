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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  Search,
  MoreVertical,
  FileText,
  Send,
  Download,
  Copy,
  Play,
  Square,
  XCircle,
  Calendar as CalendarIcon,
  Filter,
} from "lucide-react";
import type { Contract, ContractStatus, ContractFilters } from "@/types/contracts";

const Contracts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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
      let query = supabase
        .from('contracts')
        .select('*')
        .eq('user_id', user?.id);

      // Apply filters
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      
      if (filters.clientId) {
        query = query.eq('client_id', filters.clientId);
      }
      
      if (filters.responsibleId) {
        query = query.eq('responsible_id', filters.responsibleId);
      }

      if (filters.startDate) {
        const dateField = filters.dateType === 'created' ? 'created_at' : 'start_date';
        query = query.gte(dateField, filters.startDate);
      }

      if (filters.endDate) {
        const dateField = filters.dateType === 'created' ? 'created_at' : 'end_date';
        query = query.lte(dateField, filters.endDate);
      }

      // Apply sorting
      query = query.order(sortField, { ascending: sortDirection === 'asc' });

      const { data, error } = await query;

      if (error) throw error;

      // Apply search filter client-side
      let filtered = data || [];
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(c => 
          c.title.toLowerCase().includes(searchLower) ||
          c.contract_number.toLowerCase().includes(searchLower)
        );
      }

      // Map data to Contract type
      const mappedContracts: Contract[] = filtered.map(c => ({
        ...c,
        tags: (Array.isArray(c.tags) ? c.tags : []) as string[],
        variables: (typeof c.variables === 'object' && c.variables !== null ? c.variables : {}) as Record<string, any>,
        signature_settings: (typeof c.signature_settings === 'object' && c.signature_settings !== null ? c.signature_settings : {}) as Record<string, any>,
      }));

      setContracts(mappedContracts);
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
            const { data: maxNumber } = await supabase
              .from('contracts')
              .select('contract_number')
              .eq('user_id', user?.id)
              .order('contract_number', { ascending: false })
              .limit(1)
              .single();

            const newNumber = maxNumber 
              ? `${parseInt(maxNumber.contract_number) + 1}`.padStart(6, '0')
              : '000001';

            await supabase.from('contracts').insert({
              user_id: user?.id,
              contract_number: newNumber,
              title: `${original.title} (Cópia)`,
              client_id: original.client_id,
              responsible_id: original.responsible_id,
              status: 'DRAFT',
              content: original.content,
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

        const { error } = await supabase
          .from('contracts')
          .update({ status: statusMap[action] as ContractStatus })
          .in('id', selectedIds);

        if (error) throw error;
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
          <Button variant="outline">
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
                <TableRow key={contract.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(contract.id)}
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
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
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
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/contracts/${contract.id}`)}>
                          <FileText className="mr-2 h-4 w-4" />
                          Ver/Editar
                        </DropdownMenuItem>
                        {contract.status === 'DRAFT' && (
                          <DropdownMenuItem>
                            <Send className="mr-2 h-4 w-4" />
                            Enviar p/ Assinatura
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" />
                          Exportar PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar
                        </DropdownMenuItem>
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
