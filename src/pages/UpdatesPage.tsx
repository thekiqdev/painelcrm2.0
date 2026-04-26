import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Newspaper,
  Rocket,
  Search,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { announcementsUpdatesService, type UpdateListItem } from '@/services/announcementsUpdates';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const catLabel: Record<string, string> = {
  novidade: 'Novidades',
  melhoria: 'Melhorias',
  correcao: 'Correções',
  aviso: 'Avisos',
};

const catFilterValue = {
  all: 'all',
  novidade: 'novidade',
  melhoria: 'melhoria',
  correcao: 'correcao',
  aviso: 'aviso',
} as const;

function categoryIcon(category: string | null) {
  switch (category) {
    case 'novidade':
      return Rocket;
    case 'melhoria':
      return TrendingUp;
    case 'correcao':
      return Wrench;
    case 'aviso':
      return AlertTriangle;
    default:
      return Newspaper;
  }
}

function formatPublishedDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function UpdateCard({
  it,
  className,
  featuredLayout = false,
}: {
  it: UpdateListItem;
  className?: string;
  featuredLayout?: boolean;
}) {
  const Icon = categoryIcon(it.category);
  const unread = it.read === false;

  return (
    <Link to={`/updates/${it.id}`} className={cn('group block h-full', className)}>
      <Card
        className={cn(
          'h-full overflow-hidden border-border/80 bg-card shadow-sm transition-all duration-200',
          'hover:border-primary/25 hover:shadow-md',
          featuredLayout && 'md:flex md:min-h-[200px] md:flex-row',
        )}
      >
        {featuredLayout && it.banner_url ? (
          <div className="relative aspect-[21/9] w-full shrink-0 border-b border-border/60 md:aspect-auto md:w-[min(42%,320px)] md:border-b-0 md:border-r">
            <img src={it.banner_url} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <CardContent
          className={cn(
            'flex flex-1 flex-col p-5 sm:p-6',
            featuredLayout && !it.banner_url && 'md:justify-center',
          )}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
                'transition-colors group-hover:bg-primary/10 group-hover:text-primary',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </div>
            {it.category ? (
              <Badge variant="secondary" className="font-medium">
                {catLabel[it.category] ?? it.category}
              </Badge>
            ) : null}
            {unread ? (
              <Badge className="bg-primary font-semibold text-primary-foreground shadow-none">Novo</Badge>
            ) : null}
            {it.featured ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                Destaque
              </Badge>
            ) : null}
            {it.version ? (
              <span className="text-xs tabular-nums text-muted-foreground">v{it.version}</span>
            ) : null}
          </div>

          <h2
            className={cn(
              'font-semibold tracking-tight text-foreground group-hover:text-primary',
              featuredLayout ? 'text-xl sm:text-2xl' : 'text-lg leading-snug',
            )}
          >
            {it.title}
          </h2>

          {it.page_summary ? (
            <p
              className={cn(
                'mt-2 line-clamp-3 text-muted-foreground',
                featuredLayout ? 'text-base leading-relaxed' : 'text-sm leading-relaxed',
              )}
            >
              {it.page_summary}
            </p>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
            <time className="text-xs text-muted-foreground sm:text-sm" dateTime={it.published_at ?? undefined}>
              {formatPublishedDate(it.published_at)}
            </time>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              Ver detalhes
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function UpdatesPage() {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<UpdateListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    announcementsUpdatesService
      .list(filter === 'all' ? undefined : filter)
      .then((r) => {
        if (ok) setItems(r);
      })
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }))
      .finally(() => {
        if (ok) setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, [filter]);

  const searchTrim = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!searchTrim) return items;
    return items.filter((it) => {
      const t = it.title.toLowerCase();
      const s = (it.page_summary ?? '').toLowerCase();
      return t.includes(searchTrim) || s.includes(searchTrim);
    });
  }, [items, searchTrim]);

  const { hero, gridItems } = useMemo(() => {
    const list = filteredItems;
    const featuredFirst = list.find((x) => x.featured);
    if (featuredFirst) {
      return {
        hero: featuredFirst,
        gridItems: list.filter((x) => x.id !== featuredFirst.id),
      };
    }
    return { hero: null as UpdateListItem | null, gridItems: list };
  }, [filteredItems]);

  return (
    <div className="min-h-[60vh]">
      <div className="mx-auto max-w-[1200px] px-4 pb-12 pt-6 md:px-6 md:pb-16 md:pt-10">
        <header
          className={cn(
            'mb-8 border-b border-border/60 pb-8 md:mb-10 md:pb-10',
            isMobile && 'mb-6 pb-6',
          )}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Newspaper className="h-6 w-6 shrink-0 opacity-90" aria-hidden />
                <span className="text-sm font-medium uppercase tracking-wider text-primary/90">Centro de novidades</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Atualizações</h1>
              <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                Novidades, melhorias e avisos importantes da plataforma.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto lg:min-w-[320px]">
              <div className="relative flex-1 sm:max-w-xs lg:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  placeholder="Buscar por título…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Buscar atualizações por título"
                />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-full sm:w-[200px]" aria-label="Filtrar por categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={catFilterValue.all}>Todas</SelectItem>
                  <SelectItem value={catFilterValue.novidade}>Novidades</SelectItem>
                  <SelectItem value={catFilterValue.melhoria}>Melhorias</SelectItem>
                  <SelectItem value={catFilterValue.correcao}>Correções</SelectItem>
                  <SelectItem value={catFilterValue.aviso}>Avisos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : filteredItems.length === 0 ? (
          <Card className="mx-auto max-w-lg border-dashed border-border/80 bg-muted/20 shadow-none">
            <CardContent className="flex flex-col items-center px-6 py-12 text-center sm:py-14">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Newspaper className="h-7 w-7 text-muted-foreground" aria-hidden />
              </div>
              {searchTrim && items.length > 0 ? (
                <>
                  <h2 className="text-lg font-semibold tracking-tight">Nenhum resultado</h2>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Não encontrámos atualizações com &quot;{searchTrim}&quot;. Tente outro termo ou limpe a busca.
                  </p>
                  <Button type="button" variant="outline" className="mt-4" onClick={() => setSearch('')}>
                    Limpar busca
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold tracking-tight">Nenhuma atualização disponível</h2>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Quando publicarmos novidades, melhorias ou avisos importantes, eles aparecerão aqui.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6 md:space-y-8">
            {hero ? (
              <section aria-label="Destaque">
                <UpdateCard it={hero} featuredLayout />
              </section>
            ) : null}

            <section aria-label="Lista de atualizações">
              <ul className="grid list-none gap-4 md:grid-cols-2 md:gap-5 p-0 m-0">
                {gridItems.map((it) => (
                  <li key={it.id}>
                    <UpdateCard it={it} />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
