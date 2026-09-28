import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LandingLayout from '@/landingpage/components/LandingLayout';
import { fetchPublicLegalPage, type LegalPageSlug } from '@/services/legalPages';
import { sanitizeHtml } from '@/lib/sanitize';
import { formatLegalPublicationDate, replaceLegalDatePlaceholders } from '@/lib/legalPublicPlaceholders';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const COPY: Record<
  LegalPageSlug,
  { h1: string; lead: string }
> = {
  'privacy-policy': {
    h1: 'Política de Privacidade',
    lead: 'Transparência sobre o tratamento de dados na plataforma PainelCRM.',
  },
  'terms-of-service': {
    h1: 'Termos de Uso',
    lead: 'Condições gerais de utilização dos serviços PainelCRM.',
  },
};

function PublicLegalPage({ kind }: { kind: LegalPageSlug }) {
  const [html, setHtml] = useState<string>('');
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetchPublicLegalPage(kind);
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(res.error ?? 'Não foi possível carregar esta página.');
        setHtml('');
        setPublishedAt(null);
        setUpdatedAt(null);
      } else {
        setHtml(res.data.html ?? '');
        setPublishedAt(res.data.published_at ?? null);
        setUpdatedAt(res.data.updated_at ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  /** Referência temporal: publicação preferencial, senão última atualização da linha. */
  const referenceIso = publishedAt ?? updatedAt ?? null;

  const dateForPlaceholders = useMemo(() => {
    return formatLegalPublicationDate(referenceIso) ?? '—';
  }, [referenceIso]);

  const publicationLabel = useMemo(() => formatLegalPublicationDate(referenceIso), [referenceIso]);

  const safe = useMemo(() => {
    const withDates = replaceLegalDatePlaceholders(html, dateForPlaceholders);
    return sanitizeHtml(withDates);
  }, [html, dateForPlaceholders]);

  const meta = COPY[kind];
  const isEmpty = !loading && !error && safe.replace(/<[^>]+>/g, '').trim().length === 0;

  /** Navbar da landing: fixed + h-16 (4rem) + safe-area iOS/Android + folga para não cortar breadcrumb/título */
  const headerOffsetClass =
    'pt-[calc(4rem+env(safe-area-inset-top,0px)+2rem)] md:pt-[calc(4rem+env(safe-area-inset-top,0px)+2.25rem)]';

  return (
    <LandingLayout>
      <div className={headerOffsetClass}>
      <article className="border-b border-border/70 bg-gradient-to-b from-muted/50 to-background dark:from-muted/25">
        <div className="mx-auto max-w-[min(100%,58rem)] px-4 pb-10 pt-2 md:pb-14 md:pt-3">
          <nav className="text-sm font-medium text-foreground/80">
            <Link to="/" className="text-crm-primary hover:underline">
              Início
            </Link>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="text-foreground">{meta.h1}</span>
          </nav>
          <header className="mt-6 space-y-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {meta.h1}
            </h1>
            <p className="text-lg text-foreground/85 md:text-xl">{meta.lead}</p>
            {publicationLabel ? (
              <p className="text-sm font-medium text-foreground/90">
                Última publicação: <time dateTime={referenceIso ?? undefined}>{publicationLabel}</time>
              </p>
            ) : null}
          </header>
        </div>
      </article>

      <div className="bg-background pb-20 pt-8 md:pb-24 md:pt-10">
        <div className="mx-auto max-w-[min(100%,58rem)] px-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Não foi possível apresentar o documento</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : isEmpty ? (
            <Alert className="border-border bg-card text-card-foreground shadow-sm">
              <AlertTitle>Documento em preparação</AlertTitle>
              <AlertDescription className="text-muted-foreground">
                O texto legal ainda não foi publicado. Volte mais tarde ou contacte o suporte PainelCRM.
              </AlertDescription>
            </Alert>
          ) : (
            <div
              className={cn(
                'rounded-xl border border-border/90 bg-card text-card-foreground shadow-sm',
                'ring-1 ring-black/[0.04] dark:ring-white/10',
                'px-6 py-8 md:px-10 md:py-11',
              )}
            >
              <div
                className={cn(
                  'legal-public-prose prose max-w-none',
                  'text-[15px] leading-[1.75] text-foreground md:text-base',
                  'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
                  'prose-h1:mb-4 prose-h1:mt-8 prose-h1:border-b prose-h1:border-border/80 prose-h1:pb-3 prose-h1:text-3xl prose-h1:font-bold first:prose-h1:mt-0',
                  'prose-h2:mb-3 prose-h2:mt-10 prose-h2:text-2xl prose-h2:font-semibold',
                  'prose-h3:mb-3 prose-h3:mt-8 prose-h3:text-xl prose-h3:font-semibold',
                  'prose-p:my-4 prose-p:text-foreground/95',
                  'prose-strong:font-semibold prose-strong:text-foreground',
                  'prose-em:text-foreground/95',
                  'prose-a:font-medium prose-a:text-crm-primary prose-a:no-underline hover:prose-a:underline',
                  'prose-ul:my-5 prose-ul:text-foreground/95',
                  'prose-ol:my-5 prose-ol:text-foreground/95',
                  'prose-li:my-2 prose-li:leading-relaxed prose-li:text-foreground/95',
                  'dark:prose-headings:text-zinc-50 dark:prose-p:text-zinc-200 dark:prose-li:text-zinc-200',
                  'dark:prose-strong:text-zinc-50 dark:prose-em:text-zinc-200',
                )}
                dangerouslySetInnerHTML={{ __html: safe }}
              />
            </div>
          )}
        </div>
      </div>
      </div>
    </LandingLayout>
  );
}

export default PublicLegalPage;

export function PublicPrivacyPolicyPage() {
  return <PublicLegalPage kind="privacy-policy" />;
}

export function PublicTermsOfServicePage() {
  return <PublicLegalPage kind="terms-of-service" />;
}
