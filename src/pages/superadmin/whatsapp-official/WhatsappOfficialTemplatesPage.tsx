import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { whatsappOfficialAdminService, type WhatsappOfficialAccountDto } from '@/services/whatsappOfficialAdmin';
import { toast } from '@/hooks/use-toast';
import {
  normalizeTemplateName,
  extractPlaceholderIndices,
  validateTemplatePayloadClient,
  fillPreviewPlaceholders,
  type WaTemplateButtonInput,
  type WaTemplateHeaderType,
  type CreateTemplateFormPayload,
} from '@/lib/whatsappOfficialMetaTemplate';

type TemplateRow = {
  id: string;
  template_name: string;
  language: string;
  category: string | null;
  status: string | null;
  quality_score: string | null;
  rejection_reason: string | null;
  last_synced_at: string | null;
  submitted_at: string | null;
};

export type WhatsappOfficialTemplatesPageProps = {
  /** `full` é usado na rota dedicada `/conexoes/whatsapp-oficial/modelos` (título vem da página pai). */
  variant?: 'embedded' | 'full';
};

function defaultButton(kind: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'): WaTemplateButtonInput {
  if (kind === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: '' };
  if (kind === 'URL') return { type: 'URL', text: '', url: '' };
  return { type: 'PHONE_NUMBER', text: '', phone_number: '' };
}

function prepareButtonsForSubmit(buttons: WaTemplateButtonInput[]): WaTemplateButtonInput[] {
  const out: WaTemplateButtonInput[] = [];
  for (const b of buttons) {
    if (b.type === 'QUICK_REPLY') {
      if (b.text.trim()) out.push({ type: 'QUICK_REPLY', text: b.text.trim() });
    } else if (b.type === 'URL') {
      if (b.text.trim() && b.url.trim()) out.push({ type: 'URL', text: b.text.trim(), url: b.url.trim() });
    } else {
      if (b.text.trim() && b.phone_number.trim())
        out.push({ type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: b.phone_number.trim() });
    }
  }
  return out;
}

export default function WhatsappOfficialTemplatesPage({ variant = 'embedded' }: WhatsappOfficialTemplatesPageProps) {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [account, setAccount] = useState<WhatsappOfficialAccountDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const loadGeneration = useRef(0);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameDisplay, setNameDisplay] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('MARKETING');
  const [language, setLanguage] = useState('pt_BR');
  const [headerType, setHeaderType] = useState<WaTemplateHeaderType>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerMediaHandle, setHeaderMediaHandle] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState<WaTemplateButtonInput[]>([]);
  const [variableExamples, setVariableExamples] = useState<Record<string, string>>({});

  const normalizedName = useMemo(() => normalizeTemplateName(nameDisplay), [nameDisplay]);

  const placeholderTexts = useMemo(() => {
    const texts: string[] = [body];
    if (headerType === 'TEXT' && headerText) texts.push(headerText);
    if (footer.trim()) texts.push(footer.trim());
    for (const b of buttons) {
      if (b.type === 'URL') {
        texts.push(b.url);
        texts.push(b.text);
      }
    }
    return texts;
  }, [body, headerText, footer, headerType, buttons]);

  const placeholderIndices = useMemo(() => extractPlaceholderIndices(...placeholderTexts), [placeholderTexts]);

  useEffect(() => {
    setVariableExamples((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const i of placeholderIndices) {
        const k = String(i);
        if (next[k] === undefined) next[k] = '';
      }
      for (const k of Object.keys(next)) {
        if (!placeholderIndices.includes(Number(k))) delete next[k];
      }
      return next;
    });
  }, [placeholderIndices]);

  const buildFormPayload = useCallback((): CreateTemplateFormPayload => {
    const bt = prepareButtonsForSubmit(buttons);
    return {
      template_name_normalized: normalizedName,
      category,
      language: language.trim(),
      header_type: headerType,
      header_text: headerType === 'TEXT' ? headerText : undefined,
      header_media_handle:
        headerType !== 'NONE' && headerType !== 'TEXT' ? headerMediaHandle.trim() || undefined : undefined,
      body,
      footer: footer.trim() || undefined,
      buttons: bt,
      variable_examples: variableExamples,
    };
  }, [normalizedName, category, language, headerType, headerText, headerMediaHandle, body, footer, buttons, variableExamples]);

  const previewValidation = useMemo(() => validateTemplatePayloadClient(buildFormPayload()), [buildFormPayload]);

  const resetForm = () => {
    setNameDisplay('');
    setCategory('MARKETING');
    setLanguage('pt_BR');
    setHeaderType('NONE');
    setHeaderText('');
    setHeaderMediaHandle('');
    setBody('');
    setFooter('');
    setButtons([]);
    setVariableExamples({});
  };

  const load = () => {
    const gen = ++loadGeneration.current;
    setLoading(true);
    whatsappOfficialAdminService
      .listTemplates()
      .then((r) => {
        if (gen !== loadGeneration.current) return;
        setRows((r as TemplateRow[]) ?? []);
      })
      .catch((e) => {
        if (gen !== loadGeneration.current) return;
        toast({ title: 'Erro', description: String(e.message), variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    whatsappOfficialAdminService
      .getAccount()
      .then((r) => setAccount(r.account))
      .catch(() => {});
  }, []);

  const sync = async () => {
    try {
      setSyncing(true);
      const r = await whatsappOfficialAdminService.syncTemplates();
      loadGeneration.current += 1;
      setRows((r.templates as TemplateRow[]) ?? []);
      const received = r.meta_received ?? r.upserted;
      if (received === 0) {
        toast({
          title: 'Meta não devolveu modelos',
          description:
            'Confirme o WABA nas definições, token com permissão whatsapp_business_management e modelos na conta Meta.',
          duration: 14_000,
        });
      } else if (r.upserted === 0 && received > 0) {
        toast({
          title: 'Recebidos mas não gravados',
          description: 'A Meta devolveu modelos mas nenhum foi persistido. Verifique os logs do servidor.',
          variant: 'destructive',
          duration: 12_000,
        });
      } else {
        toast({
          title: 'Modelos sincronizados',
          description: `${r.upserted} modelo(s) atualizado(s)${received !== r.upserted ? ` (${received} na Meta)` : ''}.`,
        });
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      toast({
        title: err.code === 'META_TOKEN_EXPIRED' ? 'Token Meta expirado' : 'Erro',
        description: String(err.message),
        variant: 'destructive',
        duration: err.code === 'META_TOKEN_EXPIRED' ? 20000 : 8000,
      });
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  };

  const submitCreate = async () => {
    const payload = buildFormPayload();
    const err = validateTemplatePayloadClient(payload);
    if (err) {
      toast({ title: 'Validação', description: err, variant: 'destructive' });
      return;
    }
    try {
      setSubmitting(true);
      await whatsappOfficialAdminService.createTemplate({
        name: nameDisplay.trim(),
        category: payload.category,
        language: payload.language,
        header_type: payload.header_type,
        header_text: payload.header_text,
        header_media_handle: payload.header_media_handle,
        body: payload.body.trim(),
        footer: payload.footer,
        buttons: payload.buttons,
        variable_examples: payload.variable_examples,
      });
      toast({
        title: 'Modelo enviado',
        description: 'Enviado para revisão da Meta. Sincronize para atualizar o estado.',
      });
      setSheetOpen(false);
      resetForm();
      load();
    } catch (e) {
      const err = e as Error & { code?: string };
      toast({
        title: err.code === 'META_TOKEN_EXPIRED' ? 'Token Meta expirado' : 'Erro ao criar',
        description: String(err.message),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const previewBody = fillPreviewPlaceholders(body.trim(), variableExamples);
  const previewHeader =
    headerType === 'TEXT' && headerText.trim()
      ? fillPreviewPlaceholders(headerText.trim(), variableExamples)
      : headerType === 'IMAGE'
        ? '[Imagem]'
        : headerType === 'VIDEO'
          ? '[Vídeo]'
          : headerType === 'DOCUMENT'
            ? '[Documento]'
            : null;

  if (loading) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{variant === 'full' ? 'Modelos sincronizados' : 'Templates / modelos'}</CardTitle>
            <CardDescription>
              Sincroniza com o WABA na Meta. Token expirado (190): atualize nas definições da conexão antes de criar ou
              sincronizar.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={sync} disabled={syncing}>
              {syncing ? 'A sincronizar…' : 'Sincronizar modelos'}
            </Button>
            <Button
              onClick={() => {
                resetForm();
                setSheetOpen(true);
              }}
              disabled={account?.status !== 'connected'}
            >
              + Novo modelo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {account?.status !== 'connected' && (
            <Alert>
              <AlertTitle>Conta não ligada</AlertTitle>
              <AlertDescription>
                Configure e valide o access token no separador Conexão para criar modelos.
              </AlertDescription>
            </Alert>
          )}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem modelos — crie um novo ou sincronize após configurar o WABA.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Idioma</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Qualidade</TableHead>
                    <TableHead>Última sincronização</TableHead>
                    <TableHead>Rejeição</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => {
                    const st = (t.status || '').toUpperCase();
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.template_name}</TableCell>
                        <TableCell>{t.category ?? '—'}</TableCell>
                        <TableCell>{t.language}</TableCell>
                        <TableCell className="text-sm">{t.status ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.quality_score ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {t.last_synced_at ? t.last_synced_at.replace('T', ' ').slice(0, 19) : '—'}
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={t.rejection_reason ?? undefined}>
                          {t.rejection_reason ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {st === 'APPROVED' ? (
                            <Button variant="outline" size="sm" asChild>
                              <Link
                                to={`/superadmin/conexoes/whatsapp-oficial?tab=camp&campaignTpl=${encodeURIComponent(t.template_name)}&campaignLang=${encodeURIComponent(t.language)}`}
                              >
                                Usar em campanha
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-3xl flex flex-col p-0 gap-0 border-border">
          <SheetHeader className="p-6 pb-2 shrink-0 border-b">
            <SheetTitle>Novo modelo</SheetTitle>
            <SheetDescription>
              O nome será normalizado para o formato da Meta (minúsculas, _, sem acentos). Variáveis{' '}
              <code className="text-xs">{'{{1}}'}</code> exigem exemplos.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6 grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Dados básicos</Label>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Conta:</span>{' '}
                      {account?.verified_name || account?.display_phone_number || '—'}{' '}
                      <span className="text-muted-foreground">({account?.status ?? '—'})</span>
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tpl-name">Nome do modelo</Label>
                  <Input
                    id="tpl-name"
                    value={nameDisplay}
                    onChange={(e) => setNameDisplay(e.target.value)}
                    placeholder="Ex.: Promoção Maio"
                  />
                  <p className="text-xs text-muted-foreground">
                    Normalizado: <code className="rounded bg-muted px-1">{normalizedName || '—'}</code>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MARKETING">MARKETING</SelectItem>
                        <SelectItem value="UTILITY">UTILITY</SelectItem>
                        <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt_BR">pt_BR</SelectItem>
                        <SelectItem value="en_US">en_US</SelectItem>
                        <SelectItem value="es_ES">es_ES</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Cabeçalho</Label>
                  <Select
                    value={headerType}
                    onValueChange={(v) => setHeaderType(v as WaTemplateHeaderType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Nenhum</SelectItem>
                      <SelectItem value="TEXT">Texto</SelectItem>
                      <SelectItem value="IMAGE">Imagem</SelectItem>
                      <SelectItem value="DOCUMENT">Documento</SelectItem>
                      <SelectItem value="VIDEO">Vídeo</SelectItem>
                    </SelectContent>
                  </Select>
                  {headerType === 'TEXT' && (
                    <Input
                      value={headerText}
                      onChange={(e) => setHeaderText(e.target.value)}
                      placeholder="Texto do cabeçalho (máx. 60 chars recomendado)"
                    />
                  )}
                  {headerType !== 'NONE' && headerType !== 'TEXT' && (
                    <div className="space-y-1">
                      <Input
                        value={headerMediaHandle}
                        onChange={(e) => setHeaderMediaHandle(e.target.value)}
                        placeholder="Handle da Meta após upload (obrigatório para mídia)"
                      />
                      <p className="text-xs text-muted-foreground">
                        Envie o ficheiro ao gestor de mídia da Meta e cole o handle aqui, ou use cabeçalho texto/nenhum.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tpl-body">Corpo</Label>
                  <Textarea
                    id="tpl-body"
                    rows={5}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={'Olá {{1}}, a sua oferta está disponível.'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tpl-footer">Rodapé (opcional)</Label>
                  <Input
                    id="tpl-footer"
                    value={footer}
                    onChange={(e) => setFooter(e.target.value)}
                    maxLength={60}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="mr-auto">Botões (opcional)</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setButtons((prev) => [...prev, defaultButton('QUICK_REPLY')])}
                    >
                      + Resposta rápida
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setButtons((prev) => [...prev, defaultButton('URL')])}
                    >
                      + URL
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setButtons((prev) => [...prev, defaultButton('PHONE_NUMBER')])}
                    >
                      + Telefone
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {buttons.map((b, idx) => (
                      <div key={idx} className="rounded-md border p-3 space-y-2 bg-muted/20">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium text-muted-foreground">
                            {b.type === 'QUICK_REPLY' ? 'Resposta rápida' : b.type === 'URL' ? 'URL' : 'Telefone'}
                          </span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setButtons(buttons.filter((_, i) => i !== idx))}>
                            Remover
                          </Button>
                        </div>
                        <Input
                          placeholder="Texto do botão"
                          value={b.text}
                          onChange={(e) => {
                            const v = e.target.value;
                            setButtons(buttons.map((x, i) => (i === idx ? { ...x, text: v } : x)));
                          }}
                        />
                        {b.type === 'URL' && (
                          <Input
                            placeholder="https://exemplo.com/{{1}}"
                            value={b.url}
                            onChange={(e) => {
                              const v = e.target.value;
                              setButtons(buttons.map((x, i) => (i === idx && x.type === 'URL' ? { ...x, url: v } : x)));
                            }}
                          />
                        )}
                        {b.type === 'PHONE_NUMBER' && (
                          <Input
                            placeholder="+351912345678"
                            value={b.phone_number}
                            onChange={(e) => {
                              const v = e.target.value;
                              setButtons(
                                buttons.map((x, i) =>
                                  i === idx && x.type === 'PHONE_NUMBER' ? { ...x, phone_number: v } : x,
                                ),
                              );
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {placeholderIndices.length > 0 && (
                  <div className="space-y-2">
                    <Label>Exemplos das variáveis (obrigatório para enviar)</Label>
                    <div className="grid gap-2">
                      {placeholderIndices.map((n) => (
                        <div key={n} className="flex items-center gap-2">
                          <span className="text-xs w-14 shrink-0 text-muted-foreground">{`{{${n}}}`}</span>
                          <Input
                            value={variableExamples[String(n)] ?? ''}
                            onChange={(e) =>
                              setVariableExamples((prev) => ({ ...prev, [String(n)]: e.target.value }))
                            }
                            placeholder={`Exemplo para {{${n}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 lg:sticky lg:top-0 self-start">
                <Label>Preview (estilo WhatsApp)</Label>
                <div className="rounded-xl border bg-[hsl(142_52%_92%)] dark:bg-emerald-950/35 p-4 shadow-sm max-w-sm">
                  {previewHeader && (
                    <p className="text-sm font-semibold mb-1 text-foreground/90">{previewHeader}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap text-foreground/95">{previewBody || '…'}</p>
                  {footer.trim() ? (
                    <p className="text-xs text-muted-foreground mt-2">{fillPreviewPlaceholders(footer.trim(), variableExamples)}</p>
                  ) : null}
                  {prepareButtonsForSubmit(buttons).length > 0 && (
                    <div className="mt-3 flex flex-col gap-1">
                      {prepareButtonsForSubmit(buttons).map((b, i) => (
                        <div
                          key={i}
                          className="text-center text-sm py-1.5 rounded-md bg-background/80 border border-emerald-700/15 text-emerald-900 dark:text-emerald-100"
                        >
                          {b.type === 'URL'
                            ? fillPreviewPlaceholders(b.text, variableExamples)
                            : b.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {previewValidation && (
                  <Alert variant="destructive">
                    <AlertTitle>Não pode enviar ainda</AlertTitle>
                    <AlertDescription>{previewValidation}</AlertDescription>
                  </Alert>
                )}
                {!previewValidation && normalizedName && body.trim() && (
                  <p className="text-xs text-muted-foreground">Pronto para enviar à Meta para revisão.</p>
                )}
              </div>
            </div>
          </ScrollArea>
          <div className="p-4 border-t flex justify-end gap-2 shrink-0 bg-background">
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={submitCreate} disabled={submitting || account?.status !== 'connected'}>
              {submitting ? 'A enviar…' : 'Enviar para a Meta'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
