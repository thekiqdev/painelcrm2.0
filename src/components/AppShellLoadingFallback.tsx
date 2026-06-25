/**
 * Fallback shell-first: estrutura visível imediata (sidebar + header + área de conteúdo)
 * em vez de tela branca com spinner centralizado.
 */
export function AppShellLoadingFallback() {
  return (
    <div className="flex min-h-[100dvh] min-h-screen w-full bg-background text-foreground">
      <aside
        className="hidden md:flex w-[13.5rem] shrink-0 flex-col border-r border-border/70 bg-sidebar/95"
        aria-hidden
      >
        <div className="h-14 border-b border-border/50 bg-muted/30" />
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden md:flex h-16 shrink-0 items-center gap-3 border-b border-border/80 bg-background/95 px-4">
          <div className="h-9 flex-1 max-w-xl rounded-md bg-muted/50 animate-pulse" />
          <div className="h-9 w-9 rounded-lg bg-muted/50 animate-pulse" />
          <div className="h-9 w-9 rounded-lg bg-muted/50 animate-pulse" />
          <div className="h-9 w-24 rounded-lg bg-muted/50 animate-pulse" />
        </header>
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="h-8 w-48 rounded-md bg-muted/50 animate-pulse" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl border bg-card animate-pulse" />
              ))}
            </div>
            <div className="h-64 rounded-xl border bg-card animate-pulse" />
          </div>
        </main>
      </div>
    </div>
  );
}
