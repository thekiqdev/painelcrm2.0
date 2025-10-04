import { useState, useEffect } from "react";
import { Plus, FileText, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { NewTemplateDialog } from "@/components/projects/templates/NewTemplateDialog";
import { EditTemplateDialog } from "@/components/projects/templates/EditTemplateDialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  created_at: string;
}

export default function ProjectTemplates() {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, [user]);

  const loadTemplates = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("project_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os templates",
        variant: "destructive",
      });
      return;
    }

    setTemplates((data || []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description || "",
      tags: (Array.isArray(t.tags) ? t.tags : []) as string[],
      created_at: t.created_at
    })));
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const { error } = await supabase
      .from("project_templates")
      .delete()
      .eq("id", templateId);

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o template",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Sucesso",
      description: "Template excluído com sucesso",
    });

    loadTemplates();
  };

  const handleDuplicateTemplate = async (template: ProjectTemplate) => {
    // Buscar stages e tasks
    const { data: stages, error: stagesError } = await supabase
      .from("project_template_stages")
      .select("*, project_template_tasks(*)")
      .eq("template_id", template.id)
      .order("order_position", { ascending: true });

    if (stagesError) {
      toast({
        title: "Erro",
        description: "Não foi possível duplicar o template",
        variant: "destructive",
      });
      return;
    }

    // Criar novo template
    const { data: newTemplate, error: templateError } = await supabase
      .from("project_templates")
      .insert({
        user_id: user?.id,
        name: `${template.name} (Cópia)`,
        description: template.description,
        tags: template.tags,
      })
      .select()
      .single();

    if (templateError || !newTemplate) {
      toast({
        title: "Erro",
        description: "Não foi possível criar a cópia do template",
        variant: "destructive",
      });
      return;
    }

    // Duplicar stages e tasks
    for (const stage of stages || []) {
      const { data: newStage, error: stageError } = await supabase
        .from("project_template_stages")
        .insert({
          template_id: newTemplate.id,
          name: stage.name,
          order_position: stage.order_position,
          offset_days: stage.offset_days,
        })
        .select()
        .single();

      if (stageError || !newStage) continue;

      // Duplicar tasks
      const tasks = stage.project_template_tasks || [];
      if (tasks.length > 0) {
        const tasksToInsert = tasks.map((task: any) => ({
          stage_id: newStage.id,
          title: task.title,
          description: task.description,
          offset_days: task.offset_days,
          duration_days: task.duration_days,
          priority: task.priority,
          role: task.role,
          tags: task.tags,
        }));

        await supabase.from("project_template_tasks").insert(tasksToInsert);
      }
    }

    toast({
      title: "Sucesso",
      description: "Template duplicado com sucesso",
    });

    loadTemplates();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Templates de Projeto</h1>
          <p className="text-muted-foreground">
            Crie modelos reutilizáveis para seus projetos
          </p>
        </div>
        <Button onClick={() => setNewDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Template
        </Button>
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
            <p className="text-muted-foreground text-center">
              Nenhum template criado ainda.
              <br />
              Clique em "Novo Template" para começar.
            </p>
          </CardContent>
        </Card>
      )}

      <NewTemplateDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onSuccess={loadTemplates}
      />

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
