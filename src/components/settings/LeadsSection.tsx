
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { PlusCircle, Trash2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { settingsService } from "@/services/settings";

interface LeadStatus {
  id: string;
  name: string;
  color: string;
}

export const LeadsSection = ({ handleSave }: { handleSave: (e: React.FormEvent) => void }) => {
  const [leadStatuses, setLeadStatuses] = useState<LeadStatus[]>([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#4C7CFF");
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Fetch lead statuses
  const fetchLeadStatuses = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const data = await settingsService.getLeadStatuses();
      setLeadStatuses(data || []);
    } catch (error: any) {
      console.error("Erro ao buscar status:", error.message);
      toast.error("Não foi possível carregar os status dos leads");
    } finally {
      setIsLoading(false);
    }
  };

  // Add new status
  const handleAddStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusName.trim()) {
      toast.error("Nome do status é obrigatório");
      return;
    }

    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }

    try {
      const newStatus = await settingsService.createLeadStatus({
        name: newStatusName.trim(),
        color: newStatusColor
      });
      
      setLeadStatuses([...leadStatuses, newStatus]);
      setNewStatusName("");
      setNewStatusColor("#4C7CFF");
      toast.success("Status adicionado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao adicionar status:", error.message);
      toast.error("Não foi possível adicionar o status");
    }
  };

  // Delete status
  const handleDeleteStatus = async (id: string) => {
    if (!user) return;
    
    try {
      await settingsService.deleteLeadStatus(id);

      setLeadStatuses(leadStatuses.filter(status => status.id !== id));
      toast.success("Status removido com sucesso!");
    } catch (error: any) {
      console.error("Erro ao remover status:", error.message);
      toast.error("Não foi possível remover o status");
    }
  };

  // Load lead statuses on component mount
  useEffect(() => {
    if (user) {
      fetchLeadStatuses();
    }
  }, [user]);

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gerenciamento de Status de Leads</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Input
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder="Nome do Status"
                  className="w-full"
                />
              </div>
              <div>
                <Input
                  type="color"
                  value={newStatusColor}
                  onChange={(e) => setNewStatusColor(e.target.value)}
                  className="w-full h-10"
                />
              </div>
              <div>
                <Button type="button" onClick={handleAddStatus} className="w-full">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Adicionar Status
                </Button>
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-4">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : leadStatuses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-4">
                    Nenhum status cadastrado
                  </TableCell>
                </TableRow>
              ) : (
                leadStatuses.map((status) => (
                  <TableRow key={status.id}>
                    <TableCell>
                      <Badge style={{ backgroundColor: status.color }}>
                        {status.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div 
                        className="w-6 h-6 rounded-full" 
                        style={{ backgroundColor: status.color }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteStatus(status.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit">
          <Save className="mr-2 h-4 w-4" />
          Salvar Alterações
        </Button>
      </div>
    </form>
  );
};
