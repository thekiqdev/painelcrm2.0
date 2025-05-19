
import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Calendar } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { Project } from "./types";
import { Progress } from "@/components/ui/progress";

interface ProjectsListViewProps {
  projects: Project[];
  onViewDetails: (project: Project) => void;
  onNewProject: () => void;
}

export function ProjectsListView({ projects, onViewDetails, onNewProject }: ProjectsListViewProps) {
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
        <Button onClick={onNewProject}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Projeto
        </Button>
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
              
              <p className="text-sm text-muted-foreground mb-3">
                {project.description.length > 80 
                  ? project.description.substring(0, 80) + "..."
                  : project.description}
              </p>
              
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
        
        <Card className="flex items-center justify-center p-6 border-dashed border-2">
          <Button variant="ghost" onClick={onNewProject}>
            <Plus className="h-6 w-6 mr-2" />
            Novo Projeto
          </Button>
        </Card>
      </div>
    </div>
  );
}
