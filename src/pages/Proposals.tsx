
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const Proposals = () => {
  const [activeTab, setActiveTab] = useState("all");
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Propostas / Orçamentos</h1>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Proposta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>Criar Nova Proposta</DialogTitle>
              <DialogDescription>
                Preencha os detalhes para criar uma nova proposta comercial
              </DialogDescription>
            </DialogHeader>
            <form>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título</Label>
                    <Input id="title" placeholder="Ex: Proposta de Serviços de Software" required />
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
                    <Label htmlFor="amount">Valor Total</Label>
                    <Input id="amount" placeholder="R$ 0,00" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Validade</Label>
                    <Input id="dueDate" type="date" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="funnel">Funil</Label>
                    <Select>
                      <SelectTrigger id="funnel">
                        <SelectValue placeholder="Selecione um funil" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="funnel-3">Funil de Propostas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Detalhes da Proposta</Label>
                  <Textarea id="description" placeholder="Descreva os detalhes da proposta..." />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
                <Button type="submit">Criar Proposta</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="all" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="draft">Rascunhos</TabsTrigger>
          <TabsTrigger value="sent">Enviadas</TabsTrigger>
          <TabsTrigger value="accepted">Aceitas</TabsTrigger>
          <TabsTrigger value="rejected">Recusadas</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ProposalCard />
              <ProposalCard />
              <ProposalCard />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="draft">
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ProposalCard />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="sent">
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ProposalCard />
              <ProposalCard />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="accepted">
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ProposalCard />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="rejected">
          <div className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ProposalCard />
            </div>
          </div>
        </TabsContent>
        
        {["all", "draft", "sent", "accepted", "rejected"].includes(activeTab) && (
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Veja e gerencie suas propostas no funil de vendas
            </p>
            <Button variant="outline" asChild>
              <a href="/funnel" className="inline-flex items-center">
                <FileText className="mr-2 h-4 w-4" />
                Ver Funil de Propostas
              </a>
            </Button>
          </div>
        )}
      </Tabs>
    </div>
  );
};

const ProposalCard = () => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md">Proposta de Marketing Digital</CardTitle>
        <p className="text-sm text-muted-foreground">Construtora XYZ</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Valor:</span>
            <span className="font-medium">R$ 25.000,00</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Envio:</span>
            <span>28/06/2023</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Validade:</span>
            <span>28/07/2023</span>
          </div>
          <div className="flex justify-between items-center text-sm pt-2 border-t mt-2">
            <span className="text-muted-foreground">Status:</span>
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800 font-medium">
              Enviada
            </span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t flex gap-2">
          <Button variant="outline" size="sm" className="flex-1">
            Visualizar
          </Button>
          <Button size="sm" className="flex-1">
            Editar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Proposals;
