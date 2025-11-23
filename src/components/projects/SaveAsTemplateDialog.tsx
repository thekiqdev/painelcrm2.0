import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Project } from "./types";
import { useAuth } from "@/contexts/AuthContext";
import { projectTemplatesService } from "@/services/projectTemplates";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2 } from "lucide-react";
import { differenceInDays } from "date-fns";

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  project,
}: SaveAsTemplateDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [templateName, setTemplateName] = useState(project.name);
  const [templateDescription, setTemplateDescription] = useState(project.description);
  const [visibility, setVisibility] = useState<"private" | "tenant">("tenant");
  const [convertDatesToOffsets, setConvertDatesToOffsets] = useState(true);
  const [removeAttachments, setRemoveAttachments] = useState(true);
  const [replaceAssignees, setReplaceAssignees] = useState(true);

  const handleSaveTemplate = async () => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar autenticado para salvar um template",
        variant: "destructive",
      });
      return;
    }

    if (!templateName.trim()) {
      toast({
        title: "Erro",
        description: "O nome do template é obrigatório",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Calcular data de início do projeto (primeira tarefa ou data de criação)
      const projectStartDate = new Date(); // Idealmente pegar do projeto real
      
      // Criar o template
      const newTemplate = await projectTemplatesService.createTemplate({
        name: templateName,
        description: templateDescription,
        tags: project.tags || [],
      });

      // Criar stages (listas) do template
      for (const [index, list] of project.lists.entries()) {
        const newStage = await projectTemplatesService.createTemplateStage(newTemplate.id, {
          name: list.name,
          order_position: index,
          offset_days: 0, // Stage não tem offset próprio
        });

        // Criar tasks da stage
        for (const task of list.tasks) {
          let offsetDays = 0;
          let durationDays = 1;

          // Calcular offset se solicitado
          if (convertDatesToOffsets && task.dueDate) {
            const taskDate = new Date(task.dueDate);
            offsetDays = differenceInDays(taskDate, projectStartDate);
          }

          // Determinar papel genérico se solicitado
          let role = "";
          if (replaceAssignees && task.assignee) {
            // Mapear baseado no papel do membro
            const assigneeRole = task.assignee.role?.toLowerCase() || "";
            if (assigneeRole.includes("project") || assigneeRole.includes("pm")) {
              role = "PM";
            } else if (assigneeRole.includes("design")) {
              role = "Designer";
            } else if (assigneeRole.includes("dev") || assigneeRole.includes("engineer")) {
              role = "Developer";
            } else {
              role = "Team Member";
            }
          }

          await projectTemplatesService.createTemplateTask(newStage.id, {
            title: task.title,
            description: task.description,
            offset_days: offsetDays,
            duration_days: durationDays,
            priority: task.priority,
            role: role,
            tags: task.tags || [],
          });
        }
      }

      toast({
        title: "Template criado",
        description: "O modelo foi criado com sucesso a partir do projeto.",
      });

      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast({
        title: "Erro ao salvar template",
        description: error.message || "Não foi possível salvar o template",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Salvar como Modelo
          </DialogTitle>
          <DialogDescription>
            Converta este projeto em um modelo reutilizável
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="templateName">Nome do Modelo *</Label>
            <Input
              id="templateName"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Ex: Projeto de Website Padrão"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="templateDescription">Descrição</Label>
            <Textarea
              id="templateDescription"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Descreva o propósito deste modelo..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">Visibilidade</Label>
            <Select value={visibility} onValueChange={(v: any) => setVisibility(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tenant">Equipe (Tenant)</SelectItem>
                <SelectItem value="private">Privado</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {visibility === "tenant" 
                ? "Todos os membros da equipe poderão usar este modelo"
                : "Apenas você terá acesso a este modelo"}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Label>Opções de Conversão</Label>
            
            <div className="flex items-start space-x-3">
              <Checkbox
                id="convertDates"
                checked={convertDatesToOffsets}
                onCheckedChange={(checked) => setConvertDatesToOffsets(checked as boolean)}
              />
              <div className="space-y-1 leading-none">
                <label
                  htmlFor="convertDates"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Converter datas em offsets relativos
                </label>
                <p className="text-xs text-muted-foreground">
                  Datas serão calculadas em relação à data de início do projeto
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="removeAttachments"
                checked={removeAttachments}
                onCheckedChange={(checked) => setRemoveAttachments(checked as boolean)}
              />
              <div className="space-y-1 leading-none">
                <label
                  htmlFor="removeAttachments"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Limpar anexos e comentários
                </label>
                <p className="text-xs text-muted-foreground">
                  Remove arquivos e comentários específicos do projeto
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="replaceAssignees"
                checked={replaceAssignees}
                onCheckedChange={(checked) => setReplaceAssignees(checked as boolean)}
              />
              <div className="space-y-1 leading-none">
                <label
                  htmlFor="replaceAssignees"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Substituir responsáveis por papéis genéricos
                </label>
                <p className="text-xs text-muted-foreground">
                  Converte pessoas específicas em papéis como PM, Designer, Dev
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSaveTemplate} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Modelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}