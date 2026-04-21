import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { PlusCircle, Edit2, Trash2, Check, AlertTriangle } from "lucide-react";
import { evolutionApi, type EvolutionApiConfig } from "@/services/evolutionApi";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const EvolutionApiConfigComponent = () => {
  const [configs, setConfigs] = useState<EvolutionApiConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<EvolutionApiConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<EvolutionApiConfig | null>(null);
  
  // Form fields
  const [configName, setConfigName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  
  const fetchConfigs = async () => {
    setIsLoading(true);
    try {
      const allConfigs = await evolutionApi.getAllConfigs();
      setConfigs(allConfigs);
      
      const active = await evolutionApi.getActiveConfig();
      setActiveConfig(active);
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações", {
        description: "Não foi possível obter as configurações da Evolution API."
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchConfigs();
  }, []);
  
  const handleAddConfig = () => {
    setSelectedConfig(null);
    setConfigName("");
    setApiUrl("");
    setApiKey("");
    setIsConfigModalOpen(true);
  };
  
  const handleEditConfig = (config: EvolutionApiConfig) => {
    setSelectedConfig(config);
    setConfigName(config.name);
    setApiUrl(config.api_url);
    setApiKey(config.global_key);
    setIsConfigModalOpen(true);
  };
  
  const handleDeleteConfig = (config: EvolutionApiConfig) => {
    setSelectedConfig(config);
    setIsDeleteDialogOpen(true);
  };
  
  const handleSetActiveConfig = async (config: EvolutionApiConfig) => {
    setIsLoading(true);
    try {
      await evolutionApi.setActiveConfigById(config.id);
      toast.success("Configuração ativada com sucesso!");
      await fetchConfigs();
    } catch (error) {
      console.error("Erro ao ativar configuração:", error);
      toast.error("Erro ao ativar configuração", {
        description: "Não foi possível definir esta configuração como ativa."
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveConfig = async () => {
    if (!configName || !apiUrl || !apiKey) {
      toast.error("Todos os campos são obrigatórios");
      return;
    }
    
    setIsLoading(true);
    try {
      if (selectedConfig) {
        await evolutionApi.updateConfig(selectedConfig.id, {
          name: configName,
          api_url: apiUrl,
          global_key: apiKey
        });
        toast.success("Configuração atualizada com sucesso!");
      } else {
        await evolutionApi.saveConfig(configName, apiUrl, apiKey);
        toast.success("Configuração adicionada com sucesso!");
      }
      
      setIsConfigModalOpen(false);
      await fetchConfigs();
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração", {
        description: "Não foi possível salvar a configuração da Evolution API."
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleConfirmDelete = async () => {
    if (!selectedConfig) return;
    
    setIsLoading(true);
    try {
      await evolutionApi.deleteConfig(selectedConfig.id);
      toast.success("Configuração excluída com sucesso!");
      setIsDeleteDialogOpen(false);
      await fetchConfigs();
    } catch (error) {
      console.error("Erro ao excluir configuração:", error);
      toast.error("Erro ao excluir configuração", {
        description: "Não foi possível excluir a configuração da Evolution API."
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Configurações da Evolution API</CardTitle>
            <CardDescription>
              Gerencie suas conexões com a Evolution API
            </CardDescription>
          </div>
          <Button onClick={handleAddConfig}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Nova Configuração
          </Button>
        </CardHeader>
        
        <CardContent>
          {configs.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4 mr-2" />
              <AlertDescription>
                Nenhuma configuração encontrada. Adicione uma configuração clicando no botão acima.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>URL da API</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>{config.name}</TableCell>
                    <TableCell>{config.api_url}</TableCell>
                    <TableCell>
                      {config.is_active ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                          <Check className="h-3 w-3 mr-1" /> Ativa
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Inativa</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!config.is_active && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleSetActiveConfig(config)}
                          >
                            Ativar
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEditConfig(config)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeleteConfig(config)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        
        <CardFooter className="text-sm text-muted-foreground">
          {activeConfig ? (
            <p>Configuração ativa: <strong>{activeConfig.name}</strong></p>
          ) : (
            <p>Nenhuma configuração ativa no momento.</p>
          )}
        </CardFooter>
      </Card>
      
      <Dialog open={isConfigModalOpen} onOpenChange={setIsConfigModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedConfig ? "Editar Configuração" : "Nova Configuração"} da Evolution API
            </DialogTitle>
            <DialogDescription>
              {selectedConfig 
                ? "Atualize os detalhes da configuração da Evolution API." 
                : "Adicione uma nova configuração para conectar com a Evolution API."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="configName">Nome da Configuração</Label>
              <Input
                id="configName"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="Ex: Evolution API Principal"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="apiUrl">URL da API</Label>
              <Input
                id="apiUrl"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="Ex: https://evo.painelcrm.com"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="apiKey">Chave Global da API</Label>
              <Input
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Sua chave global da Evolution API"
                type="password"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveConfig} disabled={isLoading}>
              {isLoading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a configuração "{selectedConfig?.name}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isLoading}>
              {isLoading ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EvolutionApiConfigComponent;
