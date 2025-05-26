
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
import { toast } from "sonner";
import { PlusCircle, Edit2, Trash2, Check, AlertTriangle, Server } from "lucide-react";
import { evolutionApi, type EvolutionServerConfig } from "@/services/evolutionApi";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const EvolutionServerConfigComponent = () => {
  const [servers, setServers] = useState<EvolutionServerConfig[]>([]);
  const [activeServer, setActiveServer] = useState<EvolutionServerConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  
  // Form fields
  const [serverName, setServerName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  
  const fetchServers = async () => {
    setIsLoading(true);
    try {
      const allServers = await evolutionApi.getAllServers();
      setServers(allServers);
      
      const active = await evolutionApi.getActiveServer();
      setActiveServer(active);
    } catch (error) {
      console.error("Erro ao carregar servidores:", error);
      toast.error("Erro ao carregar servidores", {
        description: "Não foi possível obter os servidores da Evolution API."
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchServers();
  }, []);
  
  const handleAddServer = () => {
    setServerName("");
    setServerUrl("");
    setApiKey("");
    setIsServerModalOpen(true);
  };
  
  const handleSetActiveServer = async (server: EvolutionServerConfig) => {
    setIsLoading(true);
    try {
      await evolutionApi.setActiveServer(server.id);
      toast.success("Servidor ativado com sucesso!");
      await fetchServers();
    } catch (error) {
      console.error("Erro ao ativar servidor:", error);
      toast.error("Erro ao ativar servidor", {
        description: "Não foi possível definir este servidor como ativo."
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveServer = async () => {
    if (!serverName || !serverUrl || !apiKey) {
      toast.error("Todos os campos são obrigatórios");
      return;
    }
    
    setIsLoading(true);
    try {
      await evolutionApi.saveServer(serverName, serverUrl, apiKey);
      toast.success("Servidor adicionado com sucesso!");
      
      setIsServerModalOpen(false);
      await fetchServers();
    } catch (error) {
      console.error("Erro ao salvar servidor:", error);
      toast.error("Erro ao salvar servidor", {
        description: "Não foi possível salvar o servidor da Evolution API."
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
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Servidores Evolution API
            </CardTitle>
            <CardDescription>
              Gerencie seus servidores da Evolution API
            </CardDescription>
          </div>
          <Button onClick={handleAddServer}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Novo Servidor
          </Button>
        </CardHeader>
        
        <CardContent>
          {servers.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4 mr-2" />
              <AlertDescription>
                Nenhum servidor encontrado. Adicione um servidor clicando no botão acima.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>URL do Servidor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell>{server.name}</TableCell>
                    <TableCell>{server.server_url}</TableCell>
                    <TableCell>
                      {server.is_active ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 text-green-800 text-xs font-medium">
                          <Check className="h-3 w-3 mr-1" /> Ativo
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Inativo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!server.is_active && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleSetActiveServer(server)}
                          >
                            Ativar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        
        <CardFooter className="text-sm text-muted-foreground">
          {activeServer ? (
            <p>Servidor ativo: <strong>{activeServer.name}</strong></p>
          ) : (
            <p>Nenhum servidor ativo no momento.</p>
          )}
        </CardFooter>
      </Card>
      
      <Dialog open={isServerModalOpen} onOpenChange={setIsServerModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Servidor Evolution API</DialogTitle>
            <DialogDescription>
              Adicione um novo servidor para conectar com a Evolution API.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="serverName">Nome do Servidor</Label>
              <Input
                id="serverName"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="Ex: Servidor Evolution Principal"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="serverUrl">URL do Servidor</Label>
              <Input
                id="serverUrl"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="Ex: https://evo.painelcrm.com"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="apiKey">Chave da API</Label>
              <Input
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Sua chave da Evolution API"
                type="password"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsServerModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveServer} disabled={isLoading}>
              {isLoading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EvolutionServerConfigComponent;
