import { Suspense, lazy, type ComponentProps } from 'react';
import type { GlobalSearchPanelContent } from './GlobalSearchPanelContent';

const GlobalSearchPanelContentLazy = lazy(() =>
  import('./GlobalSearchPanelContent').then((m) => ({ default: m.GlobalSearchPanelContent })),
);

type Props = ComponentProps<typeof GlobalSearchPanelContent> & {
  enabled: boolean;
};

function SearchPanelFallback() {
  return (
    <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
      Carregando busca…
    </div>
  );
}

/** Painel de busca global — chunk carregado só na primeira abertura (clique, foco ou Ctrl+K). */
export function GlobalSearchPanelLazy({ enabled, ...props }: Props) {
  if (!enabled) return null;
  return (
    <Suspense fallback={<SearchPanelFallback />}>
      <GlobalSearchPanelContentLazy {...props} />
    </Suspense>
  );
}
