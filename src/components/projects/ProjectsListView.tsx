import React, { useMemo, useState } from "react";
import {
  Archive,
  Edit,
  ExternalLink,
  FolderOpen,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ClientEntityLink } from "@/components/entities";
import type { Member } from "@/components/shared/types";
import { Project } from "./types";
import {
  PROJECTS_LIST_PAGE_SIZE,
  calculateProjectTaskProgress,
  computeProjectFinanceSummary,
  formatFinanceBalance,
  formatFinanceCell,
  formatFinanceSpent,
  formatProjectDueDate,
  formatProjectRelativeTime,
  projectStatusBadgeVariant,
  projectStatusLabel,
  resolveProjectResponsibles,
} from "./projectListUtils";
import { cn } from "@/lib/utils";

export interface ProjectsListViewProps {
  projects: Project[];
  members: Member[];
  kanbanStageLabels?: Record<string, string>;
  onOpen: (project: Project) => void;
  onEdit?: (project: Project) => void;
  onArchive?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  canDelete?: boolean;
}

function ResponsibleAvatars({ responsibles }: { responsibles: Member[] }) {
  if (responsibles.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const primary = responsibles[0];
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border/60">
        <AvatarFallback className="text-[10px]">{primary.avatar}</AvatarFallback>
      </Avatar>
      <span className="hidden truncate text-sm text-foreground lg:inline">{primary.name}</span>
      {responsibles.length > 1 ? (
        <span className="hidden text-xs text-muted-foreground lg:inline">+{responsibles.length - 1}</span>
      ) : null}
    </div>
  );
}

function ProjectRowActions({
  project,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  canDelete,
}: {
  project: Project;
  onOpen: (project: Project) => void;
  onEdit?: (project: Project) => void;
  onArchive?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  canDelete?: boolean;
}) {
  return (
    <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        aria-label="Abrir projeto"
        onClick={() => onOpen(project)}
      >
        <ExternalLink className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2"
            aria-label="Mais ações"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onOpen(project)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Abrir
          </DropdownMenuItem>
          {onEdit ? (
            <DropdownMenuItem onClick={() => onEdit(project)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
          ) : null}
          {onArchive && project.status !== "archived" ? (
            <DropdownMenuItem onClick={() => onArchive(project)}>
              <Archive className="mr-2 h-4 w-4" />
              Arquivar
            </DropdownMenuItem>
          ) : null}
          {canDelete && onDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(project)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ProjectMobileCard({
  project,
  members,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  canDelete,
}: {
  project: Project;
  members: Member[];
  onOpen: (project: Project) => void;
  onEdit?: (project: Project) => void;
  onArchive?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  canDelete?: boolean;
}) {
  const progress = calculateProjectTaskProgress(project);
  const finance = computeProjectFinanceSummary(project.financeItems);
  const responsibles = resolveProjectResponsibles(project, members);

  return (
    <Card
      className="cursor-pointer border-border/70 transition-colors hover:bg-muted/40"
      onClick={() => onOpen(project)}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug text-foreground">{project.name}</p>
            {project.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
            ) : null}
          </div>
          <Badge variant={projectStatusBadgeVariant(project.status)} className="shrink-0">
            {projectStatusLabel(project.status)}
          </Badge>
        </div>

        {project.client_id ? (
          <div className="text-xs" onClick={(e) => e.stopPropagation()}>
            <ClientEntityLink
              clientId={project.client_id}
              name={project.clientName}
              disabledFallbackText="Cliente não identificado"
              variant="compact"
              stopPropagationOnClick
              className="inline min-w-0 max-w-full"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <ResponsibleAvatars responsibles={responsibles} />
          <span>Prazo: {formatProjectDueDate(project.dueDate)}</span>
          <span>{formatProjectRelativeTime(project.updated_at)}</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {finance ? (
          <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums text-muted-foreground">
            <div>
              <span className="block text-[10px] uppercase tracking-wide">Orçamento</span>
              <span className="font-medium text-foreground">{formatFinanceCell(finance)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide">Gasto</span>
              <span className="font-medium text-foreground">{formatFinanceSpent(finance)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide">Saldo</span>
              <span
                className={cn(
                  "font-medium",
                  finance.balance >= 0 ? "text-emerald-600" : "text-destructive",
                )}
              >
                {formatFinanceBalance(finance)}
              </span>
            </div>
          </div>
        ) : null}

        <ProjectRowActions
          project={project}
          onOpen={onOpen}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
          canDelete={canDelete}
        />
      </CardContent>
    </Card>
  );
}

export function ProjectsListView({
  projects,
  members,
  onOpen,
  onEdit,
  onArchive,
  onDelete,
  canDelete = false,
}: ProjectsListViewProps) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(projects.length / PROJECTS_LIST_PAGE_SIZE));

  const paginatedProjects = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PROJECTS_LIST_PAGE_SIZE;
    return projects.slice(start, start + PROJECTS_LIST_PAGE_SIZE);
  }, [projects, page, totalPages]);

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <div className="text-center">
            <FolderOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">Nenhum projeto encontrado</h3>
            <p className="text-sm text-muted-foreground">
              Ajuste os filtros ou crie um novo projeto.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop / tablet table */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60 hover:bg-transparent">
                <TableHead className="min-w-[220px] text-xs font-medium text-muted-foreground">
                  Projeto
                </TableHead>
                <TableHead className="hidden min-w-[140px] text-xs font-medium text-muted-foreground lg:table-cell">
                  Cliente
                </TableHead>
                <TableHead className="hidden min-w-[140px] text-xs font-medium text-muted-foreground md:table-cell">
                  Responsável
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="hidden min-w-[120px] text-xs font-medium text-muted-foreground lg:table-cell">
                  Progresso
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground xl:table-cell">
                  Prazo
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground xl:table-cell">
                  Orçamento
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground 2xl:table-cell">
                  Gasto
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground 2xl:table-cell">
                  Saldo
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground lg:table-cell">
                  Atualizado
                </TableHead>
                <TableHead className="w-[100px] text-right text-xs font-medium text-muted-foreground">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedProjects.map((project) => {
                const progress = calculateProjectTaskProgress(project);
                const finance = computeProjectFinanceSummary(project.financeItems);
                const responsibles = resolveProjectResponsibles(project, members);

                return (
                  <TableRow
                    key={project.id}
                    className="group/row cursor-pointer border-border/40 transition-colors hover:bg-muted/50"
                    onClick={() => onOpen(project)}
                  >
                    <TableCell className="align-middle">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground group-hover/row:text-primary">
                          {project.name}
                        </p>
                        {project.description ? (
                          <p className="mt-0.5 line-clamp-1 max-w-[320px] text-xs text-muted-foreground">
                            {project.description}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell
                      className="hidden align-middle lg:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.client_id ? (
                        <ClientEntityLink
                          clientId={project.client_id}
                          name={project.clientName}
                          disabledFallbackText="Cliente não identificado"
                          variant="table"
                          stopPropagationOnClick
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden align-middle md:table-cell">
                      <ResponsibleAvatars responsibles={responsibles} />
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge variant={projectStatusBadgeVariant(project.status)}>
                        {projectStatusLabel(project.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden align-middle lg:table-cell">
                      <div className="flex min-w-[100px] items-center gap-2">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden align-middle text-sm tabular-nums text-muted-foreground xl:table-cell">
                      {formatProjectDueDate(project.dueDate)}
                    </TableCell>
                    <TableCell className="hidden align-middle text-sm tabular-nums xl:table-cell">
                      {formatFinanceCell(finance)}
                    </TableCell>
                    <TableCell className="hidden align-middle text-sm tabular-nums 2xl:table-cell">
                      {formatFinanceSpent(finance)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden align-middle text-sm tabular-nums 2xl:table-cell",
                        finance && finance.balance < 0 && "text-destructive",
                        finance && finance.balance >= 0 && "text-emerald-600",
                      )}
                    >
                      {formatFinanceBalance(finance)}
                    </TableCell>
                    <TableCell className="hidden align-middle text-xs text-muted-foreground lg:table-cell">
                      {formatProjectRelativeTime(project.updated_at)}
                    </TableCell>
                    <TableCell className="text-right align-middle">
                      <ProjectRowActions
                        project={project}
                        onOpen={onOpen}
                        onEdit={onEdit}
                        onArchive={onArchive}
                        onDelete={onDelete}
                        canDelete={canDelete}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile compact cards */}
      <div className="space-y-3 md:hidden">
        {paginatedProjects.map((project) => (
          <ProjectMobileCard
            key={project.id}
            project={project}
            members={members}
            onOpen={onOpen}
            onEdit={onEdit}
            onArchive={onArchive}
            onDelete={onDelete}
            canDelete={canDelete}
          />
        ))}
      </div>

      {totalPages > 1 ? (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.max(1, p - 1));
                }}
                className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => {
                const prev = arr[idx - 1];
                const showEllipsis = prev != null && p - prev > 1;
                return (
                  <React.Fragment key={p}>
                    {showEllipsis ? (
                      <PaginationItem>
                        <span className="px-2 text-muted-foreground">…</span>
                      </PaginationItem>
                    ) : null}
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(p);
                        }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  </React.Fragment>
                );
              })}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
                className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
