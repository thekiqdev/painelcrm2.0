import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { Project } from "./types";
import { Progress } from "@/components/ui/progress";
import { ClientEntityLink } from "@/components/entities";
import { calculateProjectTaskProgress } from "./projectListUtils";

interface ProjectsGridViewProps {
  projects: Project[];
  onViewDetails: (project: Project) => void;
  onNewProject: () => void;
}

export function ProjectsGridView({ projects, onViewDetails, onNewProject }: ProjectsGridViewProps) {
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => {
          const progress = calculateProjectTaskProgress(project);
          return (
            <Card key={project.id} className="overflow-hidden">
              <div className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-medium">{project.name}</h3>
                  {project.status === "active" && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Ativo
                    </span>
                  )}
                </div>

                {project.description ? (
                  <div className="mb-3">
                    <p
                      className={`text-sm text-muted-foreground ${expandedDescriptions[project.id] ? "" : "line-clamp-2"}`}
                    >
                      {project.description}
                    </p>
                    {project.description.length > 100 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-auto p-0 text-xs text-primary hover:text-primary/80"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDescriptions((prev) => ({
                            ...prev,
                            [project.id]: !prev[project.id],
                          }));
                        }}
                      >
                        {expandedDescriptions[project.id] ? (
                          <>
                            <ChevronUp className="mr-1 h-3 w-3" />
                            Ler menos
                          </>
                        ) : (
                          <>
                            <ChevronDown className="mr-1 h-3 w-3" />
                            Ler mais
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ) : null}

                <div className="mb-3 flex items-center text-xs text-muted-foreground">
                  <Calendar className="mr-1 h-3.5 w-3.5" />
                  {project.dueDate ?? "Sem prazo"}
                </div>

                {project.client_id ? (
                  <div className="mb-3 min-w-0 text-xs text-muted-foreground">
                    <span className="mr-1 text-muted-foreground/90">Cliente:</span>
                    <ClientEntityLink
                      clientId={project.client_id}
                      name={project.clientName}
                      disabledFallbackText="Cliente não identificado"
                      variant="compact"
                      stopPropagationOnClick
                      className="inline min-w-0 max-w-full align-baseline"
                    />
                  </div>
                ) : null}

                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>Progresso</span>
                  <span>{progress}%</span>
                </div>

                <Progress value={progress} className="mb-4 h-1.5" />

                <Button onClick={() => onViewDetails(project)} variant="outline" className="w-full">
                  Ver Detalhes
                </Button>
              </div>
            </Card>
          );
        })}

        <Card
          className="flex cursor-pointer items-center justify-center border-2 border-dashed p-6 transition-colors hover:bg-muted/50"
          onClick={onNewProject}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onNewProject();
            }
          }}
        >
          <span className="flex items-center text-muted-foreground hover:text-foreground">
            <Plus className="mr-2 h-6 w-6" />
            Novo Projeto
          </span>
        </Card>
      </div>
    </div>
  );
}
