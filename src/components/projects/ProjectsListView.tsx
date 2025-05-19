
import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { Project } from "./types";

interface ProjectsListViewProps {
  projects: Project[];
  onViewDetails: (project: Project) => void;
  onNewProject: () => void;
}

export function ProjectsListView({ projects, onViewDetails, onNewProject }: ProjectsListViewProps) {
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
          <ProjectCard 
            key={project.id} 
            project={project} 
            onViewDetails={onViewDetails} 
          />
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
