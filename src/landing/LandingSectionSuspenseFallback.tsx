/** Fallback compacto para secções lazy da landing (evita ocupar ecrã inteiro). */
export function LandingSectionSuspenseFallback() {
  return (
    <div className="flex min-h-[10rem] items-center justify-center py-16">
      <div
        className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        role="status"
        aria-label="A carregar secção"
      />
    </div>
  );
}
