import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, Trash2, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

interface TemplateStage {
  id?: string;
  name: string;
  order_position: number;
  offset_days: number;
  tasks: TemplateTask[];
}

interface TemplateTask {
  id?: string;
  title: string;
  description: string;
  offset_days: number;
  duration_days: number;
  priority: string;
  role: string;
  tags: string[];
}

interface EditTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ProjectTemplate;
  onSuccess: () => void;
}

export function EditTemplateDialog({ open, onOpenChange, template, onSuccess }: EditTemplateDialogProps) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [tags, setTags] = useState<string[]>(template.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [stages, setStages] = useState<TemplateStage[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadStages();
      setName(template.name);
      setDescription(template.description);
      setTags(template.tags || []);
    }
  }, [open, template]);

  const loadStages = async () => {
    const { data, error } = await supabase
      .from("project_template_stages")
      .select("*, project_template_tasks(*)")
      .eq("template_id", template.id)
      .order("order_position", { ascending: true });

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar as etapas",
        variant: "destructive",
      });
      return;
    }

    const formattedStages = (data || []).map((stage: any) => ({
      id: stage.id,
      name: stage.name,
      order_position: stage.order_position,
      offset_days: stage.offset_days,
      tasks: (stage.project_template_tasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description || "",
        offset_days: task.offset_days,
        duration_days: task.duration_days || 1,
        priority: task.priority || "medium",
        role: task.role || "",
        tags: task.tags || [],
      })),
    }));

    setStages(formattedStages);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleAddStage = () => {
    setStages([
      ...stages,
      {
        name: "Nova Etapa",
        order_position: stages.length,
        offset_days: 0,
        tasks: [],
      },
    ]);
  };

  const handleRemoveStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const handleAddTask = (stageIndex: number) => {
    const newStages = [...stages];
    newStages[stageIndex].tasks.push({
      title: "Nova Tarefa",
      description: "",
      offset_days: 0,
      duration_days: 1,
      priority: "medium",
      role: "",
      tags: [],
    });
    setStages(newStages);
  };

  const handleRemoveTask = (stageIndex: number, taskIndex: number) => {
    const newStages = [...stages];
    newStages[stageIndex].tasks = newStages[stageIndex].tasks.filter((_, i) => i !== taskIndex);
    setStages(newStages);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Atualizar template
    const { error: templateError } = await supabase
      .from("project_templates")
      .update({
        name,
        description,
        tags,
      })
      .eq("id", template.id);

    if (templateError) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o template",
        variant: "destructive",
      });
      return;
    }

    // Deletar stages e tasks existentes
    await supabase
      .from("project_template_stages")
      .delete()
      .eq("template_id", template.id);

    // Inserir stages e tasks
    for (const [index, stage] of stages.entries()) {
      const { data: newStage, error: stageError } = await supabase
        .from("project_template_stages")
        .insert({
          template_id: template.id,
          name: stage.name,
          order_position: index,
          offset_days: stage.offset_days,
        })
        .select()
        .single();

      if (stageError || !newStage) continue;

      if (stage.tasks.length > 0) {
        const tasksToInsert = stage.tasks.map((task) => ({
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
      description: "Template atualizado com sucesso",
    });

    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Template</DialogTitle>
          <DialogDescription>
            Configure as etapas e tarefas do template
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Template</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Adicionar tag..."
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddTag}>
                  Adicionar
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleRemoveTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Etapas e Tarefas</Label>
                <Button type="button" size="sm" onClick={handleAddStage}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Etapa
                </Button>
              </div>

              <Accordion type="single" collapsible className="space-y-2">
                {stages.map((stage, stageIndex) => (
                  <AccordionItem key={stageIndex} value={`stage-${stageIndex}`}>
                    <Card>
                      <CardHeader className="pb-3">
                        <AccordionTrigger className="hover:no-underline py-0">
                          <div className="flex items-center gap-2 w-full">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <Input
                              value={stage.name}
                              onChange={(e) => {
                                const newStages = [...stages];
                                newStages[stageIndex].name = e.target.value;
                                setStages(newStages);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              value={stage.offset_days}
                              onChange={(e) => {
                                const newStages = [...stages];
                                newStages[stageIndex].offset_days = parseInt(e.target.value) || 0;
                                setStages(newStages);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Dias"
                              className="w-20"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveStage(stageIndex);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </AccordionTrigger>
                      </CardHeader>
                      <AccordionContent>
                        <CardContent className="space-y-2">
                          {stage.tasks.map((task, taskIndex) => (
                            <Card key={taskIndex} className="p-3">
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <Input
                                    value={task.title}
                                    onChange={(e) => {
                                      const newStages = [...stages];
                                      newStages[stageIndex].tasks[taskIndex].title = e.target.value;
                                      setStages(newStages);
                                    }}
                                    placeholder="Título da tarefa"
                                    className="flex-1"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveTask(stageIndex, taskIndex)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                  <Input
                                    type="number"
                                    value={task.offset_days}
                                    onChange={(e) => {
                                      const newStages = [...stages];
                                      newStages[stageIndex].tasks[taskIndex].offset_days = parseInt(e.target.value) || 0;
                                      setStages(newStages);
                                    }}
                                    placeholder="Offset (dias)"
                                  />
                                  <Input
                                    type="number"
                                    value={task.duration_days}
                                    onChange={(e) => {
                                      const newStages = [...stages];
                                      newStages[stageIndex].tasks[taskIndex].duration_days = parseInt(e.target.value) || 1;
                                      setStages(newStages);
                                    }}
                                    placeholder="Duração"
                                  />
                                  <Select
                                    value={task.priority}
                                    onValueChange={(value) => {
                                      const newStages = [...stages];
                                      newStages[stageIndex].tasks[taskIndex].priority = value;
                                      setStages(newStages);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="low">Baixa</SelectItem>
                                      <SelectItem value="medium">Média</SelectItem>
                                      <SelectItem value="high">Alta</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    value={task.role}
                                    onChange={(e) => {
                                      const newStages = [...stages];
                                      newStages[stageIndex].tasks[taskIndex].role = e.target.value;
                                      setStages(newStages);
                                    }}
                                    placeholder="Papel"
                                  />
                                </div>
                              </div>
                            </Card>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddTask(stageIndex)}
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Adicionar Tarefa
                          </Button>
                        </CardContent>
                      </AccordionContent>
                    </Card>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar Template</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
