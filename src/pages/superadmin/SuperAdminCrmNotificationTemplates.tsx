import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { Eye, FileText, Loader2, Pencil, Save } from 'lucide-react';

type TemplateRow = {
  event_key: string;
  label: string;
  description: string | null;
  channel: string;
  locale: string;
  subject_template: string | null;
  body_template: string;
  merge_fields: string[];
  version: number;
  template_id: string;
};

type ModuleGroup = {
  module: string;
  label: string;
  events: TemplateRow[];
};

function buildQuery(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

export default function SuperAdminCrmNotificationTemplates() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [modules, setModules] = useState<ModuleGroup[]>([]);
  const [filterModule, setFilterModule] = useState<string>('__all__');
  const [filterChannel, setFilterChannel] = useState<string>('whatsapp');
  const [filterLocale, setFilterLocale] = useState<string>('pt-BR');
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<TemplateRow | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [previewHints, setPreviewHints] = useState<string[] | undefined>();
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchQ.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchQ]);

  const queryStr = useMemo(
    () =>
      buildQuery({
        module: filterModule === '__all__' ? undefined : filterModule,
        channel: filterChannel === '__all__' ? undefined : filterChannel,
        locale: filterLocale === '__all__' ? undefined : filterLocale,
        q: debouncedQ || undefined,
      }),
    [filterModule, filterChannel, filterLocale, debouncedQ],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<{ ok?: boolean; modules?: ModuleGroup[] }>(
      `/api/superadmin/notification-templates${queryStr}`,
    );
    setLoading(false);
    if (res.error || !res.data?.modules) {
      toast.error(res.error ?? 'Não foi possível carregar os templates.');
      setModules([]);
      return;
    }
    setModules(res.data.modules);
  }, [queryStr]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (row: TemplateRow) => {
    setEditRow(row);
    setEditBody(row.body_template);
    setEditSubject(row.subject_template ?? '');
    setPreviewSubject(null);
    setPreviewBody(null);
    setPreviewHints(undefined);
    setPreviewError(null);
    setEditOpen(true);
  };

  const runPreview = async () => {
    if (!editRow) return;
    setPreviewing(true);
    setPreviewError(null);
    const res = await apiClient.post<{
      ok?: boolean;
      render_ok?: boolean;
      error?: string;
      rendered_subject?: string | null;
      rendered_body?: string;
      unused_merge_fields_hint?: string[];
      disallowed_placeholders?: string[];
      missing_keys?: string[];
    }>('/api/superadmin/notification-templates/preview', {
      event_key: editRow.event_key,
      body_template: editBody,
      subject_template: editSubject.trim() ? editSubject : null,
    });
    setPreviewing(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const d = res.data;
    if (!d) return;
    if (!d.render_ok) {
      setPreviewSubject(null);
      setPreviewBody(null);
      setPreviewError(d.error ?? 'Não foi possível renderizar.');
      setPreviewHints(undefined);
      return;
    }
    setPreviewSubject(d.rendered_subject ?? null);
    setPreviewBody(d.rendered_body ?? '');
    setPreviewHints(d.unused_merge_fields_hint);
    setPreviewError(null);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    const body = editBody.trim();
    if (!body) {
      toast.error('O corpo do template não pode ficar vazio.');
      return;
    }
    setSaving(true);
    const res = await apiClient.patch<{ ok?: boolean; error?: string }>(
      '/api/superadmin/notification-templates',
      {
        event_key: editRow.event_key,
        channel: editRow.channel,
        locale: editRow.locale,
        body_template: body,
        subject_template: editSubject.trim() ? editSubject.trim() : null,
      },
    );
    setSaving(false);
    if (res.error || res.data?.ok === false) {
      toast.error(res.error ?? (res.data as { error?: string })?.error ?? 'Erro ao guardar.');
      return;
    }
    toast.success('Template padrão atualizado. Tenants sem personalização passam a usar esta versão.');
    setEditOpen(false);
    void load();
  };

  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of modules) set.add(m.module);
    return [...set].sort();
  }, [modules]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Templates padrão de notificações (CRM)</h1>
        <p className="mt-1 text-muted-foreground">
          Edite os textos globais em <code className="text-xs">notification_template_system</code>. Tenants sem override
          usam estes valores; &quot;Restaurar padrão&quot; volta a esta fonte. Personalizações por empresa não são
          sobrescritas automaticamente.
        </p>
      </div>

      <Alert>
        <AlertTitle>Canal WhatsApp (esta versão)</AlertTitle>
        <AlertDescription className="text-sm">
          A lista foca-se em <strong>WhatsApp</strong> por defeito. Email e SMS aparecem ao escolher o filtro de canal.
          Placeholders usam o formato <code className="text-xs">{'{{chave.exemplo}}'}</code> conforme o catálogo de cada
          evento.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>Módulo, canal, idioma e pesquisa por evento ou descrição.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Módulo</Label>
            <Select value={filterModule} onValueChange={setFilterModule}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {moduleOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Canal</Label>
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Idioma</Label>
            <Select value={filterLocale} onValueChange={setFilterLocale}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="pt-BR">pt-BR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label className="text-xs">Pesquisar</Label>
            <Input
              placeholder="event_key ou descrição…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <div className="space-y-8">
          {modules.map((mod) => (
            <section key={mod.module} className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{mod.label}</h2>
                <Badge variant="secondary">{mod.module}</Badge>
              </div>
              <div className="rounded-md border border-border/80 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Evento</TableHead>
                      <TableHead className="text-xs text-muted-foreground">event_key</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Idioma</TableHead>
                      <TableHead className="w-[90px]">v</TableHead>
                      <TableHead className="w-[100px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mod.events.map((ev) => (
                      <TableRow key={`${ev.event_key}-${ev.channel}-${ev.locale}`}>
                        <TableCell className="font-medium">{ev.label}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground font-mono">
                          {ev.event_key}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{ev.channel}</Badge>
                        </TableCell>
                        <TableCell>{ev.locale}</TableCell>
                        <TableCell>{ev.version}</TableCell>
                        <TableCell>
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(ev)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Editar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
          {!modules.length ? (
            <p className="text-sm text-muted-foreground">Nenhum template com os filtros atuais.</p>
          ) : null}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar template padrão</DialogTitle>
            <DialogDescription>
              {editRow ? (
                <>
                  <span className="font-medium text-foreground">{editRow.label}</span>
                  <span className="block font-mono text-xs text-muted-foreground mt-1">{editRow.event_key}</span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {editRow ? (
            <div className="space-y-4 py-1">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{editRow.channel}</Badge>
                <Badge variant="secondary">{editRow.locale}</Badge>
              </div>
              {editRow.channel === 'email' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ne-subj">Assunto</Label>
                  <Input
                    id="ne-subj"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Assunto do email"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="ne-body">Corpo da mensagem</Label>
                <Textarea
                  id="ne-body"
                  className="min-h-[200px] font-mono text-sm"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Campos disponíveis (merge)</p>
                <div className="flex flex-wrap gap-1">
                  {editRow.merge_fields.map((f) => (
                    <code key={f} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                      {`{{${f}}}`}
                    </code>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={previewing} onClick={() => void runPreview()}>
                  {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                  Pré-visualizar
                </Button>
              </div>
              {previewError ? (
                <Alert variant="destructive">
                  <AlertTitle>Validação</AlertTitle>
                  <AlertDescription className="text-sm">{previewError}</AlertDescription>
                </Alert>
              ) : null}
              {previewHints?.length ? (
                <Alert>
                  <AlertTitle>Sugestão</AlertTitle>
                  <AlertDescription className="text-xs">
                    Campos do catálogo não usados no texto: {previewHints.join(', ')}
                  </AlertDescription>
                </Alert>
              ) : null}
              {(previewSubject != null || previewBody != null) && !previewError ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Pré-visualização (dados simulados)</p>
                  {previewSubject ? <p className="text-sm font-medium">{previewSubject}</p> : null}
                  <pre className="whitespace-pre-wrap text-sm">{previewBody}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar padrão global
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
