
import React, { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Project } from "./types";
import { formatDate } from "./utils";

interface ProjectCardProps {
  project: Project;
  onViewDetails: (project: Project) => void;
}

export function ProjectCard({ project, onViewDetails }: ProjectCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Calculate project progress
  const calculateProgress = () => {
    const allTasks = project.lists.flatMap(list => list.tasks);
    if (allTasks.length === 0) return 0;
    
    const completedTasks = allTasks.filter(task => task.status === "completed").length;
    return Math.round((completedTasks / allTasks.length) * 100);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{project.name}</CardTitle>
          <Badge variant={project.status === "completed" ? "outline" : "default"}>
            {project.status === "active" ? "Ativo" : project.status === "completed" ? "Concluído" : "Arquivado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {project.description && (
          <div className="mb-3">
            <p className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-2'}`}>
              {project.description}
            </p>
            {project.description.length > 100 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-auto p-0 text-xs text-primary hover:text-primary/80"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
              >
                {isExpanded ? (
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
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center">
            <CalendarIcon className="h-4 w-4 mr-1 text-muted-foreground" />
            <span className="text-muted-foreground">
              {project.dueDate ? formatDate(project.dueDate) : "Sem prazo"}
            </span>
          </div>
          <div className="flex -space-x-2">
            {project.members.slice(0, 3).map(member => (
              <Avatar key={member.id} className="border-2 border-background h-6 w-6">
                <AvatarFallback className="text-xs">{member.avatar}</AvatarFallback>
              </Avatar>
            ))}
            {project.members.length > 3 && (
              <Avatar className="border-2 border-background h-6 w-6">
                <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                  +{project.members.length - 3}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium">{calculateProgress()}%</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${calculateProgress()}%` }}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-1 pb-3">
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={() => onViewDetails(project)}
        >
          Ver Detalhes
        </Button>
      </CardFooter>
    </Card>
  );
}
