import { useCallback, useEffect, useMemo, useState } from 'react';
import { LegalPagesEditor } from '@/components/legal/LegalPagesEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import {
  fetchSuperadminLegalPage,
  publishSuperadminLegalPage,
  saveSuperadminLegalDraft,
  type LegalPageAdminPayload,
  type LegalPageSlug,
  type LegalPublicationStatus,
} from '@/services/legalPages';
import { stripVisibleTextFromHtml } from '@/lib/sanitize';
import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { ExternalLink, Eye, Globe, Scale, Send, Save } from 'lucide-react';

function formatTs(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

type TabKey = 'privacy' | 'terms';

const TAB_TO_SLUG: Record<TabKey, LegalPageSlug> = {
  privacy: 'privacy-policy',
  terms: 'terms-of-service',
};

type Loaded = {
  draft: string;
  /** Última cópia publicada conhecida (servidor), para comparar com o rascunho em edição. */
  publishedSnapshot: string;
  status: LegalPublicationStatus;
  updated_at: string | null;
  published_at: string | null;
  has_unpublished_changes: boolean;
};

const emptyLoaded: Loaded = {
  draft: '',
  publishedSnapshot: '',
  status: 'draft',
  updated_at: null,
  published_at: null,
  has_unpublished_changes: false,
};

export default function SuperAdminLegalPages() {
  const [tab, setTab] = useState<TabKey>('privacy');
  const [privacy, setPrivacy] = useState<Loaded>(emptyLoaded);
  const [terms, setTerms] = useState<Loaded>(emptyLoaded);
  const [htmlPrivacy, setHtmlPrivacy] = useState('');
  const [htmlTerms, setHtmlTerms] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadSlug = useCallback(async (slug: LegalPageSlug) => {
    const res = await fetchSuperadminLegalPage(slug);
    if (res.error || !res.data) {
      return { error: res.error ?? 'Falha ao carregar.' };
    }
    return { data: res.data };
  }, []);

  const applyLoaded = useCallback((slug: LegalPageSlug, data: LegalPageAdminPayload) => {
    const block: Loaded = {
      draft: data.content_draft ?? '',
      publishedSnapshot: data.content_published ?? '',
      status: data.status,
      updated_at: data.updated_at ?? null,
      published_at: data.published_at ?? null,
      has_unpublished_changes: data.has_unpublished_changes,
    };
    if (slug === 'privacy-policy') {
      setPrivacy(block);
      setHtmlPrivacy(block.draft);
    } else {
      setTerms(block);
      setHtmlTerms(block.draft);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [p, t] = await Promise.all([loadSlug('privacy-policy'), loadSlug('terms-of-service')]);
    if (p.error || !p.data) {
      setLoadError(p.error ?? 'Não foi possível carregar a Política de Privacidade.');
      setLoading(false);
      return;
    }
    if (t.error || !t.data) {
      setLoadError(t.error ?? 'Não foi possível carregar os Termos de Uso.');
      setLoading(false);
      return;
    }
    applyLoaded('privacy-policy', p.data);
    applyLoaded('terms-of-service', t.data);
    setLoading(false);
  }, [loadSlug, applyLoaded]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const currentSlug = TAB_TO_SLUG[tab];
  const meta = tab === 'privacy' ? privacy : terms;
  const currentHtml = tab === 'privacy' ? htmlPrivacy : htmlTerms;
  const setCurrentHtml = (v: string) => {
    if (tab === 'privacy') setHtmlPrivacy(v);
    else setHtmlTerms(v);
  };

  const draftPlainLen = useMemo(() => stripVisibleTextFromHtml(currentHtml).length, [currentHtml]);
  const canPublish = draftPlainLen >= 50 && !loading && !loadError;

  const unpublishedLocally = useMemo(() => {
    const a = sanitizeHtml(currentHtml).trim();
    const b = sanitizeHtml(meta.publishedSnapshot).trim();
    return a !== b;
  }, [currentHtml, meta.publishedSnapshot]);

  const showUnpublishedWarning =
    !loading && !loadError && (meta.has_unpublished_changes || unpublishedLocally);

  const saveDraft = async () => {
    setSavingDraft(true);
    const html = tab === 'privacy' ? htmlPrivacy : htmlTerms;
    const res = await saveSuperadminLegalDraft(currentSlug, html);
    setSavingDraft(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível guardar o rascunho.');
      return;
    }
    toast.success('Rascunho guardado. A página pública não foi alterada.');
    applyLoaded(currentSlug, res.data);
  };

  const publish = async () => {
    if (!canPublish) {
      toast.error('O rascunho precisa de pelo menos 50 caracteres visíveis para publicar.');
      return;
    }
    setPublishing(true);
    const htmlToPublish = tab === 'privacy' ? htmlPrivacy : htmlTerms;
    const res = await publishSuperadminLegalPage(currentSlug, htmlToPublish);
    setPublishing(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível publicar.');
      return;
    }
    toast.success('Documento publicado. As páginas públicas foram atualizadas.');
    applyLoaded(currentSlug, res.data);
    if (tab === 'privacy') setHtmlPrivacy(res.data.content_draft ?? '');
    else setHtmlTerms(res.data.content_draft ?? '');
  };

  const openPreview = () => {
    setPreviewOpen(true);
  };

  const publicBase = typeof window !== 'undefined' ? `${window.location.origin}` : '';
  const publicPath = tab === 'privacy' ? '/legal/privacy-policy' : '/legal/terms-of-service';
  const publicUrl = `${publicBase}${publicPath}`;

  const previewHtml = sanitizeHtml(currentHtml);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Scale className="h-7 w-7 text-crm-primary" />
          Páginas legais
        </h1>
        <p className="mt-1 text-muted-foreground">
          Indique estas URLs no Google Cloud (OAuth) e mantenha o texto alinhado à LGPD. Só depois de{' '}
          <strong className="text-foreground font-medium">Publicar</strong> é que os visitantes veem a nova versão.
        </p>
      </div>

      <Alert>
        <AlertTitle className="flex flex-wrap items-center gap-2">
          URLs públicas
          <Badge variant="secondary" className="font-normal">
            {meta.status === 'published' ? 'Com versão publicada' : 'Sem publicação'}
          </Badge>
        </AlertTitle>
        <AlertDescription className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Privacidade: </span>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{publicBase}/legal/privacy-policy</code>
          </div>
          <div>
            <span className="text-muted-foreground">Termos: </span>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{publicBase}/legal/terms-of-service</code>
          </div>
        </AlertDescription>
      </Alert>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {loadError}
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void loadAll()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {showUnpublishedWarning ? (
        <Alert>
          <AlertTitle>Alterações por publicar</AlertTitle>
          <AlertDescription>
            Existem alterações no rascunho (guardadas ou não) que ainda não foram publicadas. Os visitantes continuam a
            ver a última versão publicada até clicar em <strong className="text-foreground">Publicar</strong>.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Editar rascunho</CardTitle>
              <CardDescription>
                Cole texto do ChatGPT, Docs ou navegador — a formatação é preservada ao colar. Use &quot;Markdown →
                HTML&quot; se colou Markdown como texto simples.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="text-foreground">
                Estado:{' '}
                <Badge variant={meta.status === 'published' ? 'default' : 'outline'} className="ml-1 align-middle">
                  {meta.status === 'published' ? 'Publicado' : 'Rascunho'}
                </Badge>
              </span>
            </div>
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <p>
              Última gravação do rascunho:{' '}
              <span className="text-foreground">{formatTs(meta.updated_at) ?? '—'}</span>
            </p>
            <p>
              Última publicação:{' '}
              <span className="text-foreground">{formatTs(meta.published_at) ?? '—'}</span>
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="privacy">Privacidade</TabsTrigger>
              <TabsTrigger value="terms">Termos</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4 space-y-3 outline-none">
              {loading ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : (
                <LegalPagesEditor
                  key={currentSlug}
                  value={currentHtml}
                  onChange={setCurrentHtml}
                  placeholder={
                    tab === 'privacy'
                      ? 'Política de privacidade — rascunho…'
                      : 'Termos de uso — rascunho…'
                  }
                />
              )}
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void saveDraft()}
                disabled={loading || savingDraft || !!loadError}
                variant="secondary"
              >
                <Save className="mr-2 h-4 w-4" />
                {savingDraft ? 'A guardar…' : 'Salvar rascunho'}
              </Button>
              <Button
                type="button"
                onClick={() => void publish()}
                disabled={loading || publishing || !!loadError || !canPublish}
              >
                <Send className="mr-2 h-4 w-4" />
                {publishing ? 'A publicar…' : 'Publicar'}
              </Button>
              <Button type="button" variant="outline" onClick={openPreview} disabled={loading || !!loadError}>
                <Eye className="mr-2 h-4 w-4" />
                Pré-visualizar rascunho
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(publicPath, '_blank', 'noopener,noreferrer')}
              >
                <Globe className="mr-2 h-4 w-4" />
                Ver página pública
              </Button>
            </div>
            <p className={cn('text-xs', draftPlainLen < 50 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
              Caracteres visíveis no rascunho: {draftPlainLen}. Publicação exige pelo menos 50.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualização do rascunho</DialogTitle>
            <DialogDescription>
              Isto não é o que os visitantes veem no site — é apenas o rascunho atual. A página pública só muda após
              Publicar.
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              'prose prose-neutral max-w-none dark:prose-invert border-t border-border pt-4',
              'prose-headings:font-semibold prose-a:text-crm-primary',
            )}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" asChild>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Abrir URL pública (versão publicada)
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
