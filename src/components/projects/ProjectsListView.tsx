
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { Project } from "./types";
import { Progress } from "@/components/ui/progress";

interface ProjectsListViewProps {
  projects: Project[];
  onViewDetails: (project: Project) => void;
  onNewProject: () => void;
}

export function ProjectsListView({ projects, onViewDetails, onNewProject }: ProjectsListViewProps) {
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  // Helper function to calculate project progress
  const calculateProgress = (project: Project): number => {
    if (!project.lists || project.lists.length === 0) return 0;
    
    const totalTasks = project.lists.reduce((acc, list) => acc + list.tasks.length, 0);
    if (totalTasks === 0) return 0;
    
    const completedTasks = project.lists.reduce(
      (acc, list) => acc + list.tasks.filter(task => task.status === "completed").length, 
      0
    );
    
    return Math.round((completedTasks / totalTasks) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">Lista de Projetos</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map(project => (
          <Card key={project.id} className="overflow-hidden">
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium">{project.name}</h3>
                {project.status === "active" && (
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                    Ativo
                  </span>
                )}
              </div>
              
              {project.description && (
                <div className="mb-3">
                  <p className={`text-sm text-muted-foreground ${expandedDescriptions[project.id] ? '' : 'line-clamp-2'}`}>
                    {project.description}
                  </p>
                  {project.description.length > 100 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-auto p-0 text-xs text-primary hover:text-primary/80"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedDescriptions(prev => ({
                          ...prev,
                          [project.id]: !prev[project.id]
                        }));
                      }}
                    >
                      {expandedDescriptions[project.id] ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Ler menos
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Ler mais
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
              
              <div className="flex items-center text-xs text-muted-foreground mb-3">
                <Calendar className="h-3.5 w-3.5 mr-1" />
                {project.dueDate}
              </div>
              
              <div className="flex items-center justify-between mb-1 text-xs">
                <span>Progresso</span>
                <span>{calculateProgress(project)}%</span>
              </div>
              
              <Progress value={calculateProgress(project)} className="h-1.5 mb-4" />
              
              <Button 
                onClick={() => onViewDetails(project)} 
                variant="outline" 
                className="w-full"
              >
                Ver Detalhes
              </Button>
            </div>
          </Card>
        ))}
        
        <Card
          className="flex items-center justify-center p-6 border-dashed border-2 cursor-pointer transition-colors hover:bg-muted/50"
          onClick={onNewProject}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNewProject(); } }}
        >
          <span className="flex items-center text-muted-foreground hover:text-foreground">
            <Plus className="h-6 w-6 mr-2" />
            Novo Projeto
          </span>
        </Card>
      </div>
    </div>
  );
}
