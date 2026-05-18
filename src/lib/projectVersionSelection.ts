export type ProjectVersionStatus = 'planning' | 'development' | 'qa' | 'published' | 'archived';

export type ProjectVersionMetrics = {
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  open_tasks?: number;
  feature_tasks?: number;
  fix_tasks?: number;
  improvement_tasks?: number;
  internal_tasks?: number;
  days_remaining?: number | null;
  ready_to_publish?: boolean;
};

export type ProjectVersion = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: ProjectVersionStatus;
  start_date: string | null;
  due_date: string | null;
  release_date: string | null;
  is_default: boolean;
  sort_order: number;
  published_at: string | null;
  published_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  release_notes: string | null;
  frozen: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  metrics: ProjectVersionMetrics;
};

export type ProjectVersionSelectionMode = 'version' | 'none' | 'all';

export type ProjectVersionSelection = {
  mode: ProjectVersionSelectionMode;
  versionId?: string;
};

export function getLatestActiveVersion(versions: ProjectVersion[]): ProjectVersion | null {
  const active = versions.filter((version) => !version.archived_at);
  return (
    [...active].sort((a, b) => {
      const aCreated = a.created_at ? Date.parse(a.created_at) : Number.NaN;
      const bCreated = b.created_at ? Date.parse(b.created_at) : Number.NaN;
      if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
        return bCreated - aCreated;
      }
      if (Number.isFinite(aCreated) !== Number.isFinite(bCreated)) {
        return Number.isFinite(bCreated) ? 1 : -1;
      }
      return (b.sort_order ?? 0) - (a.sort_order ?? 0);
    })[0] ?? null
  );
}

export function getDefaultVersion(versions: ProjectVersion[]): ProjectVersion | null {
  return getLatestActiveVersion(versions);
}

export function deriveInitialVersionSelection(versions: ProjectVersion[]): ProjectVersionSelection {
  const defaultVersion = getDefaultVersion(versions);
  if (defaultVersion) {
    return { mode: 'version', versionId: defaultVersion.id };
  }
  return { mode: 'version' };
}

export function normalizeVersionSelection(
  selection: ProjectVersionSelection,
  versions: ProjectVersion[],
): ProjectVersionSelection {
  if (selection.mode === 'all') {
    return selection;
  }
  if (selection.mode === 'version' && selection.versionId) {
    const exists = versions.some(
      (version) => version.id === selection.versionId && !version.archived_at,
    );
    if (exists) {
      return selection;
    }
  }
  return deriveInitialVersionSelection(versions);
}

export function versionSelectionToQuery(selection: ProjectVersionSelection): string {
  if (selection.mode === 'all') return 'versionMode=all';
  if (selection.mode === 'version' && selection.versionId) {
    return `versionMode=version&versionId=${encodeURIComponent(selection.versionId)}`;
  }
  return 'versionMode=version';
}

export function versionSelectionKey(selection: ProjectVersionSelection): string {
  if (selection.mode === 'version') return `version:${selection.versionId ?? ''}`;
  return selection.mode;
}

export function areVersionSelectionsEqual(
  a: ProjectVersionSelection,
  b: ProjectVersionSelection,
): boolean {
  return versionSelectionKey(a) === versionSelectionKey(b);
}

export function parseVersionSelectionFromSearch(
  search: string,
  versions: ProjectVersion[] = [],
): ProjectVersionSelection {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const mode = params.get('versionMode');
  if (mode === 'all') return { mode: 'all' };
  const versionId = params.get('versionId');
  if (mode === 'version' && versionId) {
    return normalizeVersionSelection({ mode: 'version', versionId }, versions);
  }
  if (versions.length > 0) {
    return deriveInitialVersionSelection(versions);
  }
  return { mode: 'version' };
}

export function versionSelectionToTaskFilter(
  selection: ProjectVersionSelection,
  versions: ProjectVersion[] = [],
): { versionId?: string } | undefined {
  if (selection.mode === 'all') return undefined;
  const normalized = versions.length > 0 ? normalizeVersionSelection(selection, versions) : selection;
  if (normalized.mode === 'version' && normalized.versionId) {
    return { versionId: normalized.versionId };
  }
  const defaultVersion = getDefaultVersion(versions);
  if (defaultVersion) {
    return { versionId: defaultVersion.id };
  }
  return undefined;
}

export function versionIdForTaskCreate(
  selection: ProjectVersionSelection,
  versions: ProjectVersion[],
): string | undefined {
  const normalized = normalizeVersionSelection(selection, versions);
  if (normalized.mode === 'version' && normalized.versionId) {
    return normalized.versionId;
  }
  return getDefaultVersion(versions)?.id;
}

export const PROJECT_VERSION_STATUS_LABELS: Record<ProjectVersionStatus, string> = {
  planning: 'Planejamento',
  development: 'Desenvolvimento',
  qa: 'Validação',
  published: 'Publicada',
  archived: 'Arquivada',
};
