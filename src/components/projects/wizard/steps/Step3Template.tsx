import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileStack } from "lucide-react";
import { cn } from "@/lib/utils";
import { projectTemplatesService, type ProjectTemplate, type TemplateStage } from "@/services/projectTemplates";

interface Step3TemplateProps {
  selectedTemplateId: string | null;
  onSelect: (templateId: string | null) => void;
}

export function Step3Template({
  selectedTemplateId,
  onSelect,
}: Step3TemplateProps) {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{
    template: ProjectTemplate;
    stages: TemplateStage[];
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await projectTemplatesService.getTemplates();
        setTemplates(list || []);
      } catch (e) {
        console.error("Erro ao carregar templates:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadPreview = async (template: ProjectTemplate) => {
    try {
      const stages = await projectTemplatesService.getTemplateStages(template.id);
      setPreview({ template, stages });
    } catch (e) {
      console.error("Erro ao carregar preview:", e);
      setPreview(null);
    }
  };

  const handleSelectTemplate = (t: ProjectTemplate) => {
    loadPreview(t);
    onSelect(t.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-8 text-center text-muted-foreground">
        <FileStack className="mx-auto h-10 w-10 mb-3" />
        <p className="font-medium">Nenhum template disponível</p>
        <p className="mt-1 text-sm">
          Crie templates a partir de projetos em Projetos → salvar como modelo, ou em Modelos de projeto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Escolha um template para iniciar o projeto com etapas e tarefas já definidas.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <Card
            key={t.id}
            role="button"
            tabIndex={0}
            className={cn(
              "cursor-pointer transition-all hover:border-crm-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-crm-primary",
              selectedTemplateId === t.id &&
                "border-crm-primary ring-2 ring-crm-primary/30 bg-crm-primary/5"
            )}
            onClick={() => handleSelectTemplate(t)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelectTemplate(t);
              }
            }}
            aria-pressed={selectedTemplateId === t.id}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t.name}</CardTitle>
              {t.description && (
                <CardDescription className="line-clamp-2">
                  {t.description}
                </CardDescription>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>
      {preview && selectedTemplateId === preview.template.id && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Preview: {preview.template.name}</CardTitle>
            <CardDescription>
              {preview.stages.length} etapa(s)
              {preview.stages.some((s) => s.tasks?.length) &&
                ` • ${preview.stages.reduce((acc, s) => acc + (s.tasks?.length || 0), 0)} tarefa(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="text-sm space-y-1 text-muted-foreground">
              {preview.stages.map((s) => (
                <li key={s.id}>
                  • {s.name}
                  {s.tasks && s.tasks.length > 0 && (
                    <span className="ml-1">
                      ({s.tasks.length} tarefa{s.tasks.length !== 1 ? "s" : ""})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
