/**
 * Regras de features por tipo de projeto (fonte única para UI e validações).
 * Backend usa a mesma lógica em projectAreasController e projectsController.
 */
export type ProjectType = "simple" | "areas" | "advanced" | "template";

export function hasAreas(projectType: ProjectType | string | undefined | null): boolean {
  return projectType === "areas" || projectType === "advanced";
}

export function hasVersions(projectType: ProjectType | string | undefined | null): boolean {
  return projectType === "advanced";
}
