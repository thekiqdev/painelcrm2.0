
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileText, ArrowLeft, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useParams } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { proposalsService, Proposal } from "@/services/proposals";
import { clientsService } from "@/services/clients";
import { format } from "date-fns";

const ProposalDetails = () => {
  const { funnelId, stageId, proposalId } = useParams<{ funnelId: string, stageId: string, proposalId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  useEffect(() => {
    const loadProposal = async () => {
      if (!proposalId) {
        toast.error("ID da proposta não fornecido");
        navigate("/funnel");
        return;
      }

      try {
        setLoading(true);
        const proposalData = await proposalsService.getProposalById(proposalId);
        setProposal(proposalData);

        // Carregar nome do cliente
        if (proposalData.client_id) {
          const clients = await clientsService.getClients();
          const client = clients.find(c => c.id === proposalData.client_id);
          setClientName(client?.name || "Cliente não encontrado");
        }
      } catch (error) {
        console.error("Erro ao carregar proposta:", error);
        toast.error("Erro ao carregar proposta");
        navigate("/funnel");
      } finally {
        setLoading(false);
      }
    };

    loadProposal();
  }, [proposalId, navigate]);

  const handleAccept = async () => {
    if (!proposal) return;

    try {
      await proposalsService.updateProposal(proposal.id, {
        status: 'accepted'
      });
      toast.success("Proposta aceita com sucesso!");
      setIsAcceptDialogOpen(false);
      setTimeout(() => navigate(`/funnel`), 1000);
    } catch (error) {
      console.error("Erro ao aceitar proposta:", error);
      toast.error("Erro ao aceitar proposta");
    }
  };

  const handleReject = async () => {
    if (!proposal) return;

    try {
      await proposalsService.updateProposal(proposal.id, {
        status: 'rejected'
      });
      toast.success("Proposta recusada e movida para estágio apropriado");
      setIsRejectDialogOpen(false);
      setTimeout(() => navigate(`/funnel`), 1000);
    } catch (error) {
      console.error("Erro ao recusar proposta:", error);
      toast.error("Erro ao recusar proposta");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center">
          <p className="text-muted-foreground">Carregando proposta...</p>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center">
          <p className="text-muted-foreground">Proposta não encontrada</p>
          <Button onClick={() => navigate("/funnel")} className="mt-4">
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const statusLabels: { [key: string]: string } = {
    'draft': 'Rascunho',
    'sent': 'Enviada',
    'accepted': 'Aceita',
    'rejected': 'Recusada',
    'expired': 'Expirada'
  };

  const statusColors: { [key: string]: string } = {
    'draft': 'bg-gray-100 text-gray-800',
    'sent': 'bg-amber-100 text-amber-800',
    'accepted': 'bg-green-100 text-green-800',
    'rejected': 'bg-red-100 text-red-800',
    'expired': 'bg-red-100 text-red-800'
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate("/funnel")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Detalhes da Proposta</h1>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/proposals`)}>
            <FileText className="mr-2 h-4 w-4" />
            Ver Todas Propostas
          </Button>
          <Button variant="destructive" onClick={() => setIsRejectDialogOpen(true)}>
            <X className="mr-2 h-4 w-4" />
            Recusar
          </Button>
          <Button onClick={() => setIsAcceptDialogOpen(true)}>
            <Check className="mr-2 h-4 w-4" />
            Aceitar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xl">{proposal.title}</CardTitle>
              <p className="text-muted-foreground">{clientName}</p>
            </div>
            <Badge className={statusColors[proposal.status] || 'bg-gray-100 text-gray-800'}>
              {statusLabels[proposal.status] || proposal.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="font-semibold">{formatCurrency(proposal.amount)}</p>
            </div>
            {proposal.sent_date && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Data de Envio</p>
                <p>{format(new Date(proposal.sent_date), "dd/MM/yyyy")}</p>
              </div>
            )}
            {proposal.valid_until && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Válido até</p>
                <p>{format(new Date(proposal.valid_until), "dd/MM/yyyy")}</p>
              </div>
            )}
          </div>

          <Separator />
          
          {proposal.description && (
            <div>
              <h3 className="font-medium mb-2">Descrição</h3>
              <p className="text-sm text-muted-foreground">{proposal.description}</p>
            </div>
          )}

          <Separator />
          
          <div>
            <h3 className="font-medium mb-2">Itens da Proposta</h3>
            <div className="rounded-md border">
              <div className="grid grid-cols-12 bg-muted px-4 py-2 text-sm font-medium">
                <div className="col-span-6">Descrição</div>
                <div className="col-span-2 text-center">Qtd</div>
                <div className="col-span-2 text-right">Valor Unit.</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              {proposal.items.map((item, index) => (
                <div key={item.id || index} className="grid grid-cols-12 px-4 py-3 text-sm border-t">
                  <div className="col-span-6">{item.description}</div>
                  <div className="col-span-2 text-center">{item.quantity}</div>
                  <div className="col-span-2 text-right">{formatCurrency(item.unitPrice)}</div>
                  <div className="col-span-2 text-right font-medium">{formatCurrency(item.total)}</div>
                </div>
              ))}
              <div className="grid grid-cols-12 px-4 py-3 text-sm font-medium border-t bg-muted/50">
                <div className="col-span-10 text-right">Total:</div>
                <div className="col-span-2 text-right">{formatCurrency(proposal.amount)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accept Dialog */}
      <Dialog open={isAcceptDialogOpen} onOpenChange={setIsAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aceitar Proposta</DialogTitle>
            <DialogDescription>
              Você está prestes a aceitar esta proposta. Isso moverá a proposta para o estágio de "Aceita" no funil.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="font-medium">Proposta: {proposal.title}</p>
            <p className="text-muted-foreground">Cliente: {clientName}</p>
            <p className="text-muted-foreground">Valor: {formatCurrency(proposal.amount)}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAcceptDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAccept}>Confirmar Aceitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar Proposta</DialogTitle>
            <DialogDescription>
              Você está prestes a recusar esta proposta. Isso moverá a proposta para o estágio de "Recusada" no funil.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="font-medium">Proposta: {proposal.title}</p>
            <p className="text-muted-foreground">Cliente: {clientName}</p>
            <p className="text-muted-foreground">Valor: {formatCurrency(proposal.amount)}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject}>Confirmar Recusa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProposalDetails;
