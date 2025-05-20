
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileText, ArrowLeft, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useParams } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const ProposalDetails = () => {
  const { funnelId, stageId, proposalId } = useParams<{ funnelId: string, stageId: string, proposalId: string }>();
  const navigate = useNavigate();
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  // Mock proposal data - in a real app, this would come from your API/database
  const proposal = {
    id: proposalId || "D001",
    title: "Proposta de Marketing Digital",
    client: "Construtora XYZ",
    amount: "R$ 25.000,00",
    sentDate: "28/06/2023",
    validUntil: "28/07/2023",
    status: "Enviada",
    description: "Esta proposta inclui serviços completos de marketing digital, incluindo SEO, gerenciamento de redes sociais e campanhas Google Ads.",
    items: [
      { id: 1, description: "Gestão de Redes Sociais", quantity: 1, unitPrice: "R$ 5.000,00", total: "R$ 5.000,00" },
      { id: 2, description: "Campanha Google Ads", quantity: 1, unitPrice: "R$ 8.000,00", total: "R$ 8.000,00" },
      { id: 3, description: "Otimização SEO", quantity: 1, unitPrice: "R$ 7.000,00", total: "R$ 7.000,00" },
      { id: 4, description: "Criação de Conteúdo", quantity: 1, unitPrice: "R$ 5.000,00", total: "R$ 5.000,00" }
    ]
  };

  const handleAccept = () => {
    toast.success("Proposta aceita com sucesso!");
    setIsAcceptDialogOpen(false);
    // In a real app, you would update the database and move to the next stage
    setTimeout(() => navigate(`/funnel`), 1000);
  };

  const handleReject = () => {
    toast.success("Proposta recusada e movida para estágio apropriado");
    setIsRejectDialogOpen(false);
    // In a real app, you would update the database and move to the rejection stage
    setTimeout(() => navigate(`/funnel`), 1000);
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
              <p className="text-muted-foreground">{proposal.client}</p>
            </div>
            <Badge 
              className={
                proposal.status === "Enviada" ? "bg-amber-100 text-amber-800" :
                proposal.status === "Aceita" ? "bg-green-100 text-green-800" :
                "bg-red-100 text-red-800"
              }
            >
              {proposal.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="font-semibold">{proposal.amount}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Data de Envio</p>
              <p>{proposal.sentDate}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Válido até</p>
              <p>{proposal.validUntil}</p>
            </div>
          </div>

          <Separator />
          
          <div>
            <h3 className="font-medium mb-2">Descrição</h3>
            <p className="text-sm text-muted-foreground">{proposal.description}</p>
          </div>

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
              {proposal.items.map((item) => (
                <div key={item.id} className="grid grid-cols-12 px-4 py-3 text-sm border-t">
                  <div className="col-span-6">{item.description}</div>
                  <div className="col-span-2 text-center">{item.quantity}</div>
                  <div className="col-span-2 text-right">{item.unitPrice}</div>
                  <div className="col-span-2 text-right font-medium">{item.total}</div>
                </div>
              ))}
              <div className="grid grid-cols-12 px-4 py-3 text-sm font-medium border-t bg-muted/50">
                <div className="col-span-10 text-right">Total:</div>
                <div className="col-span-2 text-right">{proposal.amount}</div>
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
            <p className="text-muted-foreground">Cliente: {proposal.client}</p>
            <p className="text-muted-foreground">Valor: {proposal.amount}</p>
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
            <p className="text-muted-foreground">Cliente: {proposal.client}</p>
            <p className="text-muted-foreground">Valor: {proposal.amount}</p>
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
