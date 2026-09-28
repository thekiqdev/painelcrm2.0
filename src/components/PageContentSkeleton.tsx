/**
 * Fallback in-layout: skeleton na área principal sem cobrir sidebar/header já visíveis.
 * Reduz cascata de loaders full-screen em rotas dentro do AppLayout.
 */
export function PageContentSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-0 py-2 md:py-0">
      <div className="h-8 w-48 rounded-md bg-muted/50 animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border bg-card animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl border bg-card animate-pulse" />
    </div>
  );
}
