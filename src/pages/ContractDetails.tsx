import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  ArrowLeft,
  MoreVertical,
  Download,
  Send,
  Copy,
  Play,
  Square,
  XCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  Users,
  Shield,
  Paperclip,
} from "lucide-react";
import type { Contract, ContractStatus, ContractSigner, ContractEvent } from "@/types/contracts";

const ContractDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contract, setContract] = useState<Contract | null>(null);
  const [signers, setSigners] = useState<ContractSigner[]>([]);
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id && user) {
      loadContractData();
    }
  }, [id, user]);

  const loadContractData = async () => {
    try {
      setLoading(true);

      // Load contract
      const { data: contractData, error: contractError } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id)
        .eq('user_id', user?.id)
        .single();

      if (contractError) throw contractError;

      const mappedContract: Contract = {
        ...contractData,
        tags: (Array.isArray(contractData.tags) ? contractData.tags : []) as string[],
        variables: (typeof contractData.variables === 'object' && contractData.variables !== null ? contractData.variables : {}) as Record<string, any>,
        signature_settings: (typeof contractData.signature_settings === 'object' && contractData.signature_settings !== null ? contractData.signature_settings : {}) as Record<string, any>,
      };

      setContract(mappedContract);

      // Load signers
      const { data: signersData, error: signersError } = await supabase
        .from('contract_signers')
        .select('*')
        .eq('contract_id', id)
        .order('signing_order', { ascending: true });

      if (signersError) throw signersError;
      
      const mappedSigners: ContractSigner[] = (signersData || []).map(s => ({
        ...s,
        role: s.role as 'CLIENT' | 'INTERNAL',
        signature_data: (typeof s.signature_data === 'object' && s.signature_data !== null ? s.signature_data : null) as Record<string, any> | null,
      }));
      
      setSigners(mappedSigners);

      // Load events
      const { data: eventsData, error: eventsError } = await supabase
        .from('contract_events')
        .select('*')
        .eq('contract_id', id)
        .order('created_at', { ascending: false });

      if (eventsError) throw eventsError;
      
      const mappedEvents: ContractEvent[] = (eventsData || []).map(e => ({
        ...e,
        metadata: (typeof e.metadata === 'object' && e.metadata !== null ? e.metadata : {}) as Record<string, any>,
      }));
      
      setEvents(mappedEvents);
    } catch (error) {
      console.error('Error loading contract:', error);
      toast.error('Erro ao carregar contrato');
      navigate('/contracts');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status: ContractStatus) => {
    try {
      const { error } = await supabase
        .from('contracts')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      // Create event
      await supabase.from('contract_events').insert({
        contract_id: id,
        event_type: 'STATUS_CHANGED',
        description: `Status alterado para ${status}`,
        metadata: { old_status: contract?.status, new_status: status },
        created_by: user?.id,
      });

      toast.success('Status atualizado com sucesso');
      loadContractData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  const handleDuplicate = async () => {
    if (!contract) return;

    try {
      const { data: maxNumber } = await supabase
        .from('contracts')
        .select('contract_number')
        .eq('user_id', user?.id)
        .order('contract_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newNumber = maxNumber
        ? `${parseInt(maxNumber.contract_number) + 1}`.padStart(6, '0')
        : '000001';

      const { data: newContract, error: contractError } = await supabase
        .from('contracts')
        .insert({
          user_id: user?.id,
          contract_number: newNumber,
          title: `${contract.title} (Cópia)`,
          client_id: contract.client_id,
          responsible_id: contract.responsible_id,
          template_id: contract.template_id,
          content_html: contract.content_html,
          start_date: contract.start_date,
          end_date: contract.end_date,
          auto_renew: contract.auto_renew,
          renewal_period: contract.renewal_period,
          total_value: contract.total_value,
          currency: contract.currency,
          variables: contract.variables,
          signature_settings: contract.signature_settings,
          status: 'DRAFT',
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Duplicate signers
      if (signers.length > 0) {
        await supabase.from('contract_signers').insert(
          signers.map(({ id, contract_id, created_at, signed_at, signature_data, ...rest }) => ({
            contract_id: newContract.id,
            ...rest,
          }))
        );
      }

      toast.success('Contrato duplicado com sucesso');
      navigate(`/contracts/${newContract.id}`);
    } catch (error) {
      console.error('Error duplicating contract:', error);
      toast.error('Erro ao duplicar contrato');
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

  const getEventIcon = (eventType: string) => {
    const icons: Record<string, any> = {
      CREATED: FileText,
      STATUS_CHANGED: AlertCircle,
      SENT_FOR_SIGNATURE: Send,
      SIGNED: CheckCircle,
      VIEWED: Clock,
    };

    const Icon = icons[eventType] || Clock;
    return <Icon className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-muted-foreground">Carregando...</div>
        </div>
      </div>
    );
  }

  if (!contract) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/contracts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{contract.title}</h1>
              {getStatusBadge(contract.status)}
            </div>
            <p className="text-sm text-muted-foreground">
              Nº {contract.contract_number} • Atualizado em {format(new Date(contract.updated_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <MoreVertical className="mr-2 h-4 w-4" />
              Ações
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {contract.status === 'DRAFT' && (
              <DropdownMenuItem>
                <Send className="mr-2 h-4 w-4" />
                Enviar para Assinatura
              </DropdownMenuItem>
            )}
            {contract.status === 'PENDING_SIGNATURE' && (
              <DropdownMenuItem>
                <Send className="mr-2 h-4 w-4" />
                Reenviar Convites
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => handleDuplicate()}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Exportar PDF
            </DropdownMenuItem>
            {contract.status === 'DRAFT' && (
              <DropdownMenuItem onClick={() => handleStatusChange('ACTIVE')}>
                <Play className="mr-2 h-4 w-4" />
                Ativar
              </DropdownMenuItem>
            )}
            {contract.status === 'ACTIVE' && (
              <DropdownMenuItem onClick={() => handleStatusChange('INACTIVE')}>
                <Square className="mr-2 h-4 w-4" />
                Inativar
              </DropdownMenuItem>
            )}
            {contract.status !== 'CANCELLED' && (
              <DropdownMenuItem onClick={() => handleStatusChange('CANCELLED')}>
                <XCircle className="mr-2 h-4 w-4" />
                Cancelar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">
            <FileText className="mr-2 h-4 w-4" />
            Detalhes
          </TabsTrigger>
          <TabsTrigger value="signers">
            <Users className="mr-2 h-4 w-4" />
            Assinaturas ({signers.length})
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Clock className="mr-2 h-4 w-4" />
            Timeline ({events.length})
          </TabsTrigger>
          <TabsTrigger value="attachments">
            <Paperclip className="mr-2 h-4 w-4" />
            Anexos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Vigência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Início</div>
                    <div>{contract.start_date ? format(new Date(contract.start_date), 'dd/MM/yyyy') : '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Término</div>
                    <div>{contract.end_date ? format(new Date(contract.end_date), 'dd/MM/yyyy') : '-'}</div>
                  </div>
                  {contract.auto_renew && (
                    <div>
                      <Badge variant="outline">Renovação Automática</Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {contract.renewal_period} meses
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Financeiro</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Valor Total</div>
                    <div className="text-lg font-semibold">
                      {contract.total_value
                        ? new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: contract.currency,
                          }).format(Number(contract.total_value))
                        : '-'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Informações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Criado em</div>
                    <div>{format(new Date(contract.created_at), 'dd/MM/yyyy HH:mm')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Atualizado em</div>
                    <div>{format(new Date(contract.updated_at), 'dd/MM/yyyy HH:mm')}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Conteúdo do Contrato</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(contract.content_html || 'Sem conteúdo') }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signers">
          <Card>
            <CardHeader>
              <CardTitle>Assinantes</CardTitle>
              <CardDescription>
                Status de assinatura de todas as partes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data de Assinatura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signers.map((signer) => (
                    <TableRow key={signer.id}>
                      <TableCell>{signer.signing_order || '-'}</TableCell>
                      <TableCell className="font-medium">{signer.name}</TableCell>
                      <TableCell>{signer.email}</TableCell>
                      <TableCell>
                        <Badge variant={signer.role === 'CLIENT' ? 'default' : 'secondary'}>
                          {signer.role === 'CLIENT' ? 'Cliente' : 'Interno'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {signer.signed_at ? (
                          <Badge className="bg-green-500">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Assinado
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="mr-1 h-3 w-3" />
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {signer.signed_at
                          ? format(new Date(signer.signed_at), 'dd/MM/yyyy HH:mm')
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Timeline de Eventos</CardTitle>
              <CardDescription>
                Histórico completo de atividades do contrato
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {events.map((event) => (
                  <div key={event.id} className="flex gap-4 pb-4 border-b last:border-0">
                    <div className="flex-shrink-0 mt-1">
                      {getEventIcon(event.event_type)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{event.description}</div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(event.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                ))}

                {events.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum evento registrado
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments">
          <Card>
            <CardHeader>
              <CardTitle>Anexos</CardTitle>
              <CardDescription>
                Documentos e arquivos relacionados ao contrato
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Nenhum anexo disponível
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContractDetails;
