import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Newspaper,
  Rocket,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { announcementsUpdatesService, type UpdateDetail } from '@/services/announcementsUpdates';
import { emitInAppNotificationsRefresh } from '@/services/systemNotifications';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { isAnnouncementContentHtml, sanitizeAnnouncementHtml } from '@/utils/announcementRichText';

const catLabel: Record<string, string> = {
  novidade: 'Novidades',
  melhoria: 'Melhorias',
  correcao: 'Correções',
  aviso: 'Avisos',
};

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

function formatPublishedLong(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function UpdateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<UpdateDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void announcementsUpdatesService
      .markRead([id])
      .then(() => emitInAppNotificationsRefresh())
      .catch(() => {
        /* ignorar */
      });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let ok = true;
    announcementsUpdatesService
      .get(id)
      .then((d) => {
        if (ok) setItem(d);
      })
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }))
      .finally(() => {
        if (ok) setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">A carregar…</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Não encontrado.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/updates">Voltar para atualizações</Link>
        </Button>
      </div>
    );
  }

  const Icon = categoryIcon(item.category);
  const content = item.page_content?.trim() ?? '';
  const isHtml = isAnnouncementContentHtml(content);

  return (
    <div className="min-h-[70vh] pb-12">
      <div
        className={cn(
          'sticky top-0 z-10 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/90 md:static md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none',
        )}
      >
        <div className="mx-auto max-w-4xl md:pt-2">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground" asChild>
            <Link to="/updates">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Voltar
            </Link>
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-[880px] px-4 md:px-6">
        <Card className="mt-4 overflow-hidden border-border/80 shadow-md md:mt-6">
          {item.banner_url ? (
            <div className="relative aspect-[21/9] w-full border-b border-border/60 bg-muted">
              <img src={item.banner_url} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}

          <CardContent className="p-6 sm:p-8 md:p-10">
            <header className="space-y-4 border-b border-border/60 pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                {item.category ? (
                  <Badge variant="secondary" className="font-medium">
                    {catLabel[item.category] ?? item.category}
                  </Badge>
                ) : null}
                {item.featured ? (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                    Destaque
                  </Badge>
                ) : null}
                {item.version ? (
                  <span className="text-sm tabular-nums text-muted-foreground">v{item.version}</span>
                ) : null}
              </div>

              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl md:text-4xl">{item.title}</h1>

              <p className="text-sm text-muted-foreground">
                <time dateTime={item.published_at ?? undefined}>{formatPublishedLong(item.published_at)}</time>
              </p>

              {item.page_summary ? (
                <p className="text-base font-medium leading-relaxed text-foreground/90 md:text-lg">{item.page_summary}</p>
              ) : null}
            </header>

            <div
              className={cn(
                'prose prose-neutral max-w-none dark:prose-invert',
                'prose-headings:scroll-mt-20 prose-headings:font-semibold',
                'prose-p:leading-relaxed prose-p:my-4',
                'prose-li:my-1 prose-ul:my-4 prose-ol:my-4',
                'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
                'prose-img:rounded-lg prose-img:border prose-img:border-border/60 prose-img:shadow-sm',
                'prose-pre:max-w-full prose-pre:overflow-x-auto',
                'pt-8',
              )}
            >
              {content ? (
                isHtml ? (
                  <div
                    className="announcement-body overflow-x-hidden break-words"
                    dangerouslySetInnerHTML={{ __html: sanitizeAnnouncementHtml(content) }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-base leading-relaxed text-foreground/95">{content}</div>
                )
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <Link to="/updates">Voltar para atualizações</Link>
          </Button>
        </div>

        <Card className="mt-8 border-border/60 bg-muted/30 shadow-sm">
          <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="font-medium text-foreground">Continue a acompanhar as novidades</p>
              <p className="text-sm text-muted-foreground">
                Volte à lista para ver outras atualizações e mantenha a sua equipa alinhada.
              </p>
            </div>
            <Button asChild className="shrink-0">
              <Link to="/updates">Ver todas as atualizações</Link>
            </Button>
          </CardContent>
        </Card>
      </article>
    </div>
  );
}
