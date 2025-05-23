import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Settings, MoveHorizontal, Edit, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import RuleForm from "@/components/funnel/RuleForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ClientDetailsDialog from "@/components/clients/ClientDetailsDialog";
import { SalesFunnel, Deal, Client, Rule, FunnelStage } from "@/components/funnel/types";
import { clientTags, rules, sourcesOptions } from "@/components/funnel/mockData";
import { 
  handleDragOver, 
  handleDrop, 
  handleAddTagToClient, 
  handleRemoveTagFromClient, 
  handleSaveRule, 
  handleRemoveRule,
  updateClientStage,
  mapSupabaseToSalesFunnel
} from "@/components/funnel/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Interface for Supabase client object
interface SupabaseClient {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  group_id: string | null;
  funnel_stage?: string | null;
}

const FunnelDetails: React.FC = () => {
  const { funnelId } = useParams<{ funnelId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("kanban");
  const [funnel, setFunnel] = useState<SalesFunnel | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [leadStatuses, setLeadStatuses] = useState<any[]>([]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientDetailsDialog, setShowClientDetailsDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // New states for funnel settings
  const [settingsTab, setSettingsTab] = useState("general");
  const [editingFunnelName, setEditingFunnelName] = useState("");
  const [editingFunnelDescription, setEditingFunnelDescription] = useState("");
  const [editingStage, setEditingStage] = useState<FunnelStage | null>(null);
  const [showEditStageDialog, setShowEditStageDialog] = useState(false);
  const [showAddStageDialog, setShowAddStageDialog] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("bg-blue-500");

  // Available colors for stages
  const stageColors = [
    { name: "Blue", value: "bg-blue-500" },
    { name: "Purple", value: "bg-purple-500" },
    { name: "Amber", value: "bg-amber-500" },
    { name: "Green", value: "bg-green-500" },
    { name: "Emerald", value: "bg-emerald-500" },
    { name: "Red", value: "bg-red-500" },
    { name: "Sky", value: "bg-sky-500" },
    { name: "Indigo", value: "bg-indigo-500" },
    { name: "Pink", value: "bg-pink-500" }
  ];
  
  // Load funnel data from Supabase
  useEffect(() => {
    const fetchFunnelData = async () => {
      if (!funnelId) {
        console.error("Nenhum ID de funil fornecido");
        setLoading(false);
        return;
      }

      setLoading(true);
      
      try {
        console.log("Carregando funil:", funnelId);
        
        // Fetch funnel with stages
        const { data: funnelData, error: funnelError } = await supabase
          .from('sales_funnels')
          .select('*, stages:funnel_stages(*)')
          .eq('id', funnelId)
          .single();
          
        if (funnelError) {
          console.error('Erro ao carregar funil:', funnelError);
          toast.error("Erro ao carregar o funil");
          navigate('/funnel');
          return;
        }
        
        if (!funnelData) {
          console.error('Funil não encontrado');
          toast.error("Funil não encontrado");
          navigate('/funnel');
          return;
        }
        
        // Map to SalesFunnel interface
        const mappedFunnel = mapSupabaseToSalesFunnel([funnelData])[0];
        console.log("Funil carregado:", mappedFunnel);
        setFunnel(mappedFunnel);
        
        // Fetch clients for this funnel (if it's a client funnel)
        if (mappedFunnel.type === "clients") {
          const { data: clientsData, error: clientsError } = await supabase
            .from('clients')
            .select('*');
            
          if (clientsError) {
            console.error('Erro ao carregar clientes:', clientsError);
            toast.error("Erro ao carregar os clientes");
          } else if (clientsData) {
            // Map Supabase clients to the Client type expected by the funnel
            const mappedClients: Client[] = clientsData.map((client: SupabaseClient) => ({
              id: client.id,
              name: client.name,
              company: client.company || undefined,
              email: client.email || undefined,
              phone: client.phone || undefined,
              status: client.status || undefined,
              stage: client.funnel_stage || (mappedFunnel.stages[0]?.id || ""),
              tags: [],
              notes: client.notes || undefined,
              createdAt: client.created_at
            }));
            
            console.log("Clientes carregados:", mappedClients.length);
            setClients(mappedClients);
          }
        }
        
      } catch (error) {
        console.error('Erro inesperado ao carregar funil:', error);
        toast.error("Erro inesperado ao carregar o funil");
        navigate('/funnel');
      } finally {
        setLoading(false);
      }
    };
    
    fetchFunnelData();
  }, [funnelId, navigate]);

  // Initialize funnel editing state when funnel data loads
  useEffect(() => {
    if (funnel) {
      setEditingFunnelName(funnel.name);
      setEditingFunnelDescription(funnel.description);
    }
  }, [funnel]);

  // Render client card function
  const renderClientCard = (client: Client) => {
    return (
      <Card 
        key={client.id} 
        className="cursor-pointer hover:shadow-md"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("clientId", client.id);
          setDraggedClientId(client.id);
        }}
        onClick={() => {
          setSelectedClient(client);
          setShowClientDetailsDialog(true);
        }}
      >
        <CardContent className="p-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">{client.name}</p>
            {client.company && <p className="text-xs text-muted-foreground">{client.company}</p>}
            {client.email && <p className="text-xs text-muted-foreground">{client.email}</p>}
            {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
            {client.status && <p className="text-xs font-medium">{client.status}</p>}
            
            {/* Display client tags */}
            {client.tags && client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {client.tags.map(tagId => {
                  const tag = clientTags.find(t => t.id === tagId);
                  if (!tag) return null;
                  
                  return (
                    <Badge 
                      key={tag.id}
                      style={{ backgroundColor: tag.color, color: "#fff" }}
                      className="text-xs"
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Save funnel general settings
  const handleSaveFunnelGeneralSettings = () => {
    if (funnel) {
      setFunnel({
        ...funnel,
        name: editingFunnelName,
        description: editingFunnelDescription
      });
      toast.success("Configurações gerais salvas com sucesso!");
    }
  };

  // Add a new stage to the funnel
  const handleAddStage = () => {
    if (!funnel || !newStageName.trim()) return;
    
    const newStageId = `stage-${Date.now()}`;
    
    const newStage: FunnelStage = {
      id: newStageId,
      name: newStageName,
      color: newStageColor,
      order: funnel.stages.length,
      funnelId: funnel.id
    };
    
    setFunnel({
      ...funnel,
      stages: [...funnel.stages, newStage]
    });
    
    setNewStageName("");
    setNewStageColor("bg-blue-500");
    setShowAddStageDialog(false);
    
    toast.success("Estágio adicionado com sucesso!");
  };

  // Save edited stage
  const handleSaveStage = () => {
    if (!funnel || !editingStage) return;
    
    setFunnel({
      ...funnel,
      stages: funnel.stages.map(stage => 
        stage.id === editingStage.id ? editingStage : stage
      )
    });
    
    setEditingStage(null);
    setShowEditStageDialog(false);
    
    toast.success("Estágio atualizado com sucesso!");
  };

  // Delete a stage
  const handleDeleteStage = (stageId: string) => {
    if (!funnel) return;
    
    const hasItems = funnel.type === "clients" 
      ? clients.some(client => client.stage === stageId)
      : deals.some(deal => deal.stage === stageId);
    
    if (hasItems) {
      toast.error("Não é possível excluir um estágio que contém itens");
      return;
    }
    
    const filteredStages = funnel.stages.filter(stage => stage.id !== stageId);
    const reorderedStages = filteredStages.map((stage, index) => ({
      ...stage,
      order: index
    }));
    
    setFunnel({
      ...funnel,
      stages: reorderedStages
    });
    
    toast.success("Estágio excluído com sucesso!");
  };

  // Move a stage up or down in the order
  const handleMoveStage = (stageId: string, direction: 'up' | 'down') => {
    if (!funnel) return;
    
    const stageIndex = funnel.stages.findIndex(stage => stage.id === stageId);
    if (stageIndex === -1) return;
    
    if (
      (direction === 'up' && stageIndex === 0) || 
      (direction === 'down' && stageIndex === funnel.stages.length - 1)
    ) {
      return;
    }
    
    const newStages = [...funnel.stages];
    
    const targetIndex = direction === 'up' ? stageIndex - 1 : stageIndex + 1;
    [newStages[stageIndex], newStages[targetIndex]] = [newStages[targetIndex], newStages[stageIndex]];
    
    const reorderedStages = newStages.map((stage, index) => ({
      ...stage,
      order: index
    }));
    
    setFunnel({
      ...funnel,
      stages: reorderedStages
    });
    
    toast.success("Ordem dos estágios atualizada!");
  };
  
  // Process the drop event to move a client between stages
  const handleClientDrop = async (result: { clientId: string, stageId: string }) => {
    const { clientId, stageId } = result;
    
    if (!clientId || !stageId) return;
    
    // Update local state
    setClients(prevClients => 
      prevClients.map(client => 
        client.id === clientId ? { ...client, stage: stageId } : client
      )
    );
    
    setDraggedClientId(null);
    
    // Also update in database to persist the change
    const { success, error } = await updateClientStage(clientId, stageId);
    
    if (!success) {
      console.error('Error updating client stage:', error);
      toast.error("Erro ao atualizar estágio do cliente");
    } else {
      toast.success("Cliente movido com sucesso");
    }
  };

  // Client tag handlers
  const handleClientAddTag = (client: Client, tagId: string) => {
    const updatedClient = handleAddTagToClient(client, tagId);
    setClients(prevClients => 
      prevClients.map(c => c.id === client.id ? updatedClient : c)
    );
    setSelectedClient(updatedClient);
  };
  
  const handleClientRemoveTag = (client: Client, tagId: string) => {
    const updatedClient = handleRemoveTagFromClient(client, tagId);
    setClients(prevClients => 
      prevClients.map(c => c.id === client.id ? updatedClient : c)
    );
    setSelectedClient(updatedClient);
  };

  // Rules handlers
  const handleRuleSave = (rule: Rule) => {
    handleSaveRule(rule);
    setRules(prev => [...prev, rule]);
  };
  
  const handleRuleRemove = (ruleId: string) => {
    handleRemoveRule(ruleId);
    setRules(prev => prev.filter(r => r.id !== ruleId));
  };
  
  // Render the Kanban content
  const renderContent = () => {
    if (loading) {
      return (
        <TabsContent value="kanban" className="space-y-6">
          <div className="flex items-center justify-center h-64">
            <p>Carregando clientes...</p>
          </div>
        </TabsContent>
      );
    }
    
    if (funnel?.type === "clients") {
      return (
        <TabsContent value="kanban" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {funnel.stages.map((stage) => {
              const stageClients = clients.filter(client => client.stage === stage.id);
              
              return (
                <Card 
                  key={stage.id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                    const result = handleDrop(e, stage.id);
                    handleClientDrop(result);
                  }}
                >
                  <CardHeader className={`${stage.color} text-white rounded-t-lg py-2 px-3`}>
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-sm">{stage.name}</CardTitle>
                      <Badge variant="outline" className="text-white border-white">
                        {stageClients.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 space-y-2">
                    {stageClients.length > 0 ? (
                      stageClients.map(client => renderClientCard(client))
                    ) : (
                      <p className="text-center text-sm text-muted-foreground py-4">
                        Nenhum cliente neste estágio
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      );
    } else {
      return (
        <TabsContent value="kanban" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {funnel.stages.map((stage) => (
              <Card key={stage.id}>
                <CardHeader className={`${stage.color} text-white rounded-t-lg py-2 px-3`}>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm">{stage.name}</CardTitle>
                    <Badge variant="outline" className="text-white border-white">
                      {deals.filter(d => d.stage === stage.id).length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-2 space-y-2">
                  {deals
                    .filter(deal => deal.stage === stage.id)
                    .map(deal => (
                      <Card key={deal.id} className="cursor-pointer hover:shadow-md">
                        <CardContent className="p-3">
                          <p className="font-medium">{deal.title}</p>
                          <div className="flex justify-between items-center text-xs text-muted-foreground mt-2">
                            <span>{deal.client}</span>
                            <span>{deal.amount}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      );
    }
  };

  const renderListContent = () => {
    if (funnel?.type === "clients") {
      return (
        <TabsContent value="list" className="space-y-4">
          <div className="space-y-6">
            {funnel.stages.map((stage) => {
              const stageClients = clients.filter(client => client.stage === stage.id);
              
              return (
                <Card 
                  key={stage.id} 
                  className="overflow-hidden"
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                    const result = handleDrop(e, stage.id);
                    handleClientDrop(result);
                  }}
                >
                  <CardHeader className={`${stage.color} text-white py-2 px-4`}>
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-sm">{stage.name}</CardTitle>
                      <Badge variant="outline" className="text-white border-white">
                        {stageClients.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stageClients.length > 0 ? (
                          stageClients.map((client) => (
                            <TableRow 
                              key={client.id} 
                              className="cursor-pointer hover:bg-muted/50"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("clientId", client.id);
                                setDraggedClientId(client.id);
                              }}
                              onClick={() => {
                                setSelectedClient(client);
                                setShowClientDetailsDialog(true);
                              }}
                            >
                              <TableCell>{client.name}</TableCell>
                              <TableCell>{client.company || "-"}</TableCell>
                              <TableCell>{client.email || "-"}</TableCell>
                              <TableCell>{client.phone || "-"}</TableCell>
                              <TableCell>{client.status || "-"}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                              Nenhum cliente neste estágio
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      );
    } else {
      return (
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-3 px-4 text-left font-medium">Título</th>
                      <th className="py-3 px-4 text-left font-medium">Cliente</th>
                      <th className="py-3 px-4 text-left font-medium">Valor</th>
                      <th className="py-3 px-4 text-left font-medium">Estágio</th>
                      <th className="py-3 px-4 text-left font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((deal) => {
                      const stage = funnel.stages.find(s => s.id === deal.stage);
                      return (
                        <tr key={deal.id} className="border-b hover:bg-muted/50 cursor-pointer">
                          <td className="py-3 px-4">{deal.title}</td>
                          <td className="py-3 px-4">{deal.client}</td>
                          <td className="py-3 px-4">{deal.amount}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${stage?.color}`} />
                              {stage?.name}
                            </div>
                          </td>
                          <td className="py-3 px-4">{deal.dueDate}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      );
    }
  };

  const renderRulesContent = () => (
    <RuleForm 
      leadStatuses={leadStatuses}
      sourcesOptions={sourcesOptions}
      onSaveRule={handleRuleSave}
      existingRules={rules}
      onRemoveRule={handleRuleRemove}
    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p>Carregando detalhes do funil...</p>
      </div>
    );
  }

  if (!funnel) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium">Funil não encontrado</p>
          <Button className="mt-4" onClick={() => navigate("/funnel")}>
            Voltar para Funis
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/funnel")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{funnel.name}</h1>
          {funnel.isDefault && <Badge>Padrão</Badge>}
        </div>

        <div className="flex gap-2">
          <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Configurações do Funil</DialogTitle>
              </DialogHeader>
              <Tabs value={settingsTab} onValueChange={setSettingsTab} className="mt-4">
                <TabsList>
                  <TabsTrigger value="general">Geral</TabsTrigger>
                  <TabsTrigger value="stages">Estágios</TabsTrigger>
                  <TabsTrigger value="rules">Regras</TabsTrigger>
                  <TabsTrigger value="tags">Tags</TabsTrigger>
                </TabsList>
                
                <TabsContent value="general" className="space-y-4 pt-4">
                  <h3 className="text-lg font-medium">Informações Gerais</h3>
                  <div className="space-y-4">
                    <div className="grid w-full items-center gap-1.5">
                      <Label htmlFor="funnelName">Nome do Funil</Label>
                      <Input 
                        id="funnelName" 
                        value={editingFunnelName}
                        onChange={(e) => setEditingFunnelName(e.target.value)}
                        placeholder="Digite o nome do funil"
                      />
                    </div>
                    <div className="grid w-full items-center gap-1.5">
                      <Label htmlFor="funnelDescription">Descrição</Label>
                      <Textarea 
                        id="funnelDescription" 
                        value={editingFunnelDescription}
                        onChange={(e) => setEditingFunnelDescription(e.target.value)}
                        placeholder="Digite uma descrição para o funil"
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={handleSaveFunnelGeneralSettings}>
                        Salvar Alterações
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="stages" className="pt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">Estágios do Funil</h3>
                      <Button onClick={() => setShowAddStageDialog(true)} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Estágio
                      </Button>
                    </div>
                    
                    <div className="border rounded-md">
                      {funnel.stages.length > 0 ? (
                        <div className="divide-y">
                          {funnel.stages.map((stage) => (
                            <div 
                              key={stage.id} 
                              className="p-3 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <div 
                                  className={`w-4 h-4 rounded-full ${stage.color}`}
                                />
                                <span className="font-medium">{stage.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleMoveStage(stage.id, 'up')}
                                  disabled={stage.order === 0}
                                >
                                  <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    width="16" 
                                    height="16" 
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                  >
                                    <path d="m18 15-6-6-6 6"/>
                                  </svg>
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleMoveStage(stage.id, 'down')}
                                  disabled={stage.order === funnel.stages.length - 1}
                                >
                                  <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    width="16" 
                                    height="16" 
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                  >
                                    <path d="m6 9 6 6 6-6"/>
                                  </svg>
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => {
                                    setEditingStage(stage);
                                    setShowEditStageDialog(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleDeleteStage(stage.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground">
                          Nenhum estágio definido para este funil
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="rules" className="pt-4">
                  {renderRulesContent()}
                </TabsContent>

                <TabsContent value="tags" className="pt-4">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Tags</h3>
                    <p className="text-muted-foreground">Configure as tags para categorizar seus clientes</p>
                    
                    <div className="grid grid-cols-1 gap-2 mt-4">
                      {clientTags.map(tag => (
                        <div key={tag.id} className="flex items-center justify-between p-2 border rounded-md">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{ backgroundColor: tag.color }}
                            />
                            <span>{tag.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      <Button className="mt-2" variant="outline">
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Tag
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
          
          <Button onClick={() => navigate('/clients')}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Cliente
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground">{funnel.description}</p>

      {/* Indica que é possível mover clientes entre colunas */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <MoveHorizontal className="h-4 w-4" />
        <span>Arraste os cards ou as linhas da tabela para mover os clientes entre estágios</span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="list">Lista</TabsTrigger>
        </TabsList>

        {activeTab === "kanban" ? renderContent() : renderListContent()}
      </Tabs>

      {/* Client Details Dialog */}
      <ClientDetailsDialog 
        isOpen={showClientDetailsDialog}
        onClose={() => setShowClientDetailsDialog(false)}
        client={selectedClient}
        availableTags={clientTags}
        onAddTag={handleClientAddTag}
        onRemoveTag={handleClientRemoveTag}
      />

      {/* Add Stage Dialog */}
      <Dialog open={showAddStageDialog} onOpenChange={setShowAddStageDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adicionar Estágio</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="stageName">Nome do Estágio</Label>
              <Input
                id="stageName"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Digite o nome do estágio"
              />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label>Cor</Label>
              <div className="grid grid-cols-3 gap-2">
                {stageColors.map((color) => (
                  <div 
                    key={color.value}
                    className={`h-8 rounded-md cursor-pointer border-2 ${color.value} ${
                      newStageColor === color.value ? 'border-black' : 'border-transparent'
                    }`}
                    onClick={() => setNewStageColor(color.value)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStageDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddStage}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Stage Dialog */}
      <Dialog open={showEditStageDialog} onOpenChange={setShowEditStageDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Estágio</DialogTitle>
          </DialogHeader>
          {editingStage && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="editStageName">Nome do Estágio</Label>
                <Input
                  id="editStageName"
                  value={editingStage.name}
                  onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                  placeholder="Digite o nome do estágio"
                />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label>Cor</Label>
                <div className="grid grid-cols-3 gap-2">
                  {stageColors.map((color) => (
                    <div 
                      key={color.value}
                      className={`h-8 rounded-md cursor-pointer border-2 ${color.value} ${
                        editingStage.color === color.value ? 'border-black' : 'border-transparent'
                      }`}
                      onClick={() => setEditingStage({ ...editingStage, color: color.value })}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditStageDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveStage}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FunnelDetails;
