/** Fallback partilhado para lazy routes e layouts (evita duplicar markup no App). */
export function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-crm-primary" />
        <p className="mt-4 text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}
