export function getProjectUrl(projectId: string, params: Record<string, string | null | undefined> = {}): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return `/projetos/${encodeURIComponent(projectId)}${query ? `?${query}` : ''}`;
}

export function getProjectAreaUrl(
  projectId: string,
  areaId: string,
  params: Record<string, string | null | undefined> = {},
): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return `/projetos/${encodeURIComponent(projectId)}/area/${encodeURIComponent(areaId)}${query ? `?${query}` : ''}`;
}
