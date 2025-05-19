
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Plus, MoreHorizontal, Calendar, DollarSign } from "lucide-react";
import { toast } from "sonner";

type Deal = {
  id: string;
  title: string;
  client: string;
  amount: string;
  probability: number;
  dueDate: string;
  stage: string;
};

// Exemplo de lista de negócios
const initialDeals: Deal[] = [
  {
    id: "D001",
    title: "Implementação de Sistema ERP",
    client: "ABC Tecnologia",
    amount: "R$ 58.000,00",
    probability: 20,
    dueDate: "15/06/2023",
    stage: "lead",
  },
  {
    id: "D002",
    title: "Projeto de Marketing Digital",
    client: "Construtora XYZ",
    amount: "R$ 25.000,00",
    probability: 50,
    dueDate: "28/06/2023",
    stage: "lead",
  },
  {
    id: "D003",
    title: "Consultoria Estratégica",
    client: "Lima & Associados",
    amount: "R$ 45.000,00",
    probability: 75,
    dueDate: "10/07/2023",
    stage: "qualification",
  },
  {
    id: "D004",
    title: "Renovação de Licenças",
    client: "Tech Solutions",
    amount: "R$ 12.500,00",
    probability: 90,
    dueDate: "30/06/2023",
    stage: "proposal",
  },
  {
    id: "D005",
    title: "Desenvolvimento de Website",
    client: "Consultoria Global",
    amount: "R$ 35.000,00",
    probability: 60,
    dueDate: "15/07/2023",
    stage: "negotiation",
  },
  {
    id: "D006",
    title: "Expansão de Servidor",
    client: "Supermercados Sul",
    amount: "R$ 18.000,00",
    probability: 95,
    dueDate: "01/07/2023",
    stage: "closed",
  },
];

const stages = [
  { id: "lead", name: "Prospecção", color: "bg-blue-500" },
  { id: "qualification", name: "Qualificação", color: "bg-purple-500" },
  { id: "proposal", name: "Proposta", color: "bg-amber-500" },
  { id: "negotiation", name: "Negociação", color: "bg-green-500" },
  { id: "closed", name: "Fechado", color: "bg-emerald-500" },
  { id: "lost", name: "Perdido", color: "bg-red-500" },
];

const Funnel = () => {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [isNewDealDialogOpen, setIsNewDealDialogOpen] = useState(false);
  const [activeFunnel, setActiveFunnel] = useState("default");

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, dealId: string) => {
    e.dataTransfer.setData("dealId", dealId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, stage: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData("dealId");
    
    setDeals(prev => 
      prev.map(deal => {
        if (deal.id === dealId) {
          toast.success(`Negócio movido para ${stages.find(s => s.id === stage)?.name}`);
          return { ...deal, stage };
        }
        return deal;
      })
    );
  };

  const handleAddNewDeal = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Novo negócio adicionado com sucesso!");
    setIsNewDealDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Funil de Vendas</h1>

        <div className="flex flex-col sm:flex-row gap-2">
          <Tabs 
            value={activeFunnel} 
            onValueChange={setActiveFunnel}
            className="w-full sm:w-auto"
          >
            <TabsList>
              <TabsTrigger value="default">Funil Padrão</TabsTrigger>
              <TabsTrigger value="complex">Funil Complexo</TabsTrigger>
            </TabsList>
          </Tabs>

          <Dialog open={isNewDealDialogOpen} onOpenChange={setIsNewDealDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Novo Negócio
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Adicionar Novo Negócio</DialogTitle>
                <DialogDescription>
                  Preencha os detalhes do novo negócio/oportunidade
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddNewDeal}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título</Label>
                      <Input id="title" placeholder="Ex: Implementação de Sistema" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client">Cliente</Label>
                      <Select required>
                        <SelectTrigger id="client">
                          <SelectValue placeholder="Selecione um cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client1">ABC Tecnologia</SelectItem>
                          <SelectItem value="client2">Construtora XYZ</SelectItem>
                          <SelectItem value="client3">Supermercados Sul</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Valor</Label>
                      <Input id="amount" placeholder="R$ 0,00" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Data Estimada</Label>
                      <Input id="dueDate" type="date" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stage">Estágio</Label>
                      <Select defaultValue="lead">
                        <SelectTrigger id="stage">
                          <SelectValue placeholder="Selecione o estágio" />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="probability">Probabilidade (%)</Label>
                      <Input id="probability" type="number" min="0" max="100" defaultValue="50" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea id="notes" placeholder="Detalhes sobre esta oportunidade..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsNewDealDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Adicionar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          {stages.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.stage === stage.id);
            const stageTotal = stageDeals.reduce((sum, deal) => {
              const amount = parseFloat(deal.amount.replace("R$ ", "").replace(".", "").replace(",", "."));
              return sum + amount;
            }, 0);
            
            return (
              <Card 
                key={stage.id}
                className="col-span-1"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <CardHeader className={`${stage.color} text-white p-3 rounded-t-lg flex flex-row items-center justify-between`}>
                  <div>
                    <CardTitle className="text-sm font-medium">{stage.name}</CardTitle>
                    <p className="text-xs opacity-90">{stageDeals.length} negócios</p>
                  </div>
                  <Badge variant="secondary" className="bg-white/20 hover:bg-white/30 text-white">
                    R$ {stageTotal.toLocaleString('pt-BR')}
                  </Badge>
                </CardHeader>
                <CardContent className="p-3 max-h-[60vh] overflow-y-auto">
                  {stageDeals.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-md">
                      Nenhum negócio neste estágio
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stageDeals.map((deal) => (
                        <div
                          key={deal.id}
                          className="bg-white rounded-lg border shadow-sm p-3 cursor-move hover:shadow-md transition-shadow"
                          draggable
                          onDragStart={(e) => handleDragStart(e, deal.id)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-medium text-sm">{deal.title}</h3>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-sm text-gray-500 mb-2">{deal.client}</p>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center">
                              <DollarSign className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                              <span>{deal.amount}</span>
                            </div>
                            <div className="flex items-center">
                              <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                              <span>{deal.dueDate}</span>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${deal.probability}%` }}
                              />
                            </div>
                            <span className="text-xs">{deal.probability}%</span>
                          </div>
                          <div className="mt-3 flex items-center">
                            <Avatar className="h-6 w-6 mr-1">
                              <div className="bg-blue-500 h-full w-full flex items-center justify-center text-xs font-medium text-white">CS</div>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">Carlos Silva</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Funnel;
