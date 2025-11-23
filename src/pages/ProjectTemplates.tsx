import { useState, useEffect } from "react";
import { FileText, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { projectTemplatesService, ProjectTemplate } from "@/services/projectTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { EditTemplateDialog } from "@/components/projects/templates/EditTemplateDialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function ProjectTemplates() {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, [user]);

  const loadTemplates = async () => {
    if (!user) return;

    try {
      const data = await projectTemplatesService.getTemplates();
      setTemplates(data.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description || "",
        tags: (Array.isArray(t.tags) ? t.tags : []) as string[],
        created_at: t.created_at
      })));
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os templates",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await projectTemplatesService.deleteTemplate(templateId);
      toast({
        title: "Sucesso",
        description: "Template excluído com sucesso",
      });
      loadTemplates();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o template",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateTemplate = async (template: ProjectTemplate) => {
    try {
      // Buscar stages e tasks
      const stages = await projectTemplatesService.getTemplateStages(template.id);

      // Criar novo template
      const newTemplate = await projectTemplatesService.createTemplate({
        name: `${template.name} (Cópia)`,
        description: template.description,
        tags: template.tags,
      });

      // Duplicar stages e tasks
      for (const stage of stages) {
        const newStage = await projectTemplatesService.createTemplateStage(newTemplate.id, {
          name: stage.name,
          order_position: stage.order_position,
          offset_days: stage.offset_days,
        });

        // Duplicar tasks
        for (const task of stage.tasks || []) {
          await projectTemplatesService.createTemplateTask(newStage.id, {
            title: task.title,
            description: task.description,
            offset_days: task.offset_days,
            duration_days: task.duration_days,
            priority: task.priority,
            role: task.role,
            tags: task.tags,
          });
        }
      }

      toast({
        title: "Sucesso",
        description: "Template duplicado com sucesso",
      });

      loadTemplates();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível duplicar o template",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Templates de Projeto</h1>
          <p className="text-muted-foreground">
            Gerencie e use modelos reutilizáveis criados a partir de seus projetos
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground mb-1">
            Para criar um novo template:
          </p>
          <p className="text-sm font-medium">
            Abra um projeto → Configurações → Salvar como Modelo
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <FileText className="h-8 w-8 text-crm-primary mb-2" />
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDuplicateTemplate(template)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteTemplate(template.id)}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <CardTitle
                className="cursor-pointer hover:text-crm-primary"
                onClick={() => {
                  setSelectedTemplate(template);
                  setEditDialogOpen(true);
                }}
              >
                {template.name}
              </CardTitle>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {(template.tags || []).map((tag, index) => (
                  <Badge key={index} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum template criado ainda</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Para criar um template, abra um projeto existente e use a opção
              <br />
              <strong>"Configurações do Projeto → Ações → Salvar como Modelo"</strong>
            </p>
          </CardContent>
        </Card>
      )}

      {selectedTemplate && (
        <EditTemplateDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          template={selectedTemplate}
          onSuccess={loadTemplates}
        />
      )}
    </div>
  );
}
