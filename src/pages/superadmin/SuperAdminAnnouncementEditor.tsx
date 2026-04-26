import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { announcementsAdminService } from '@/services/announcementsAdmin';
import { toast } from '@/hooks/use-toast';

export default function SuperAdminAnnouncementEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [title, setTitle] = useState('');
  const [type, setType] = useState<'whatsapp_only' | 'whatsapp_and_updates_page'>('whatsapp_only');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [pageSummary, setPageSummary] = useState('');
  const [pageContent, setPageContent] = useState('');
  const [category, setCategory] = useState<string>('__none__');
  const [bannerUrl, setBannerUrl] = useState('');
  const [featured, setFeatured] = useState(false);
  const [version, setVersion] = useState('');
  const [visibilityGroupId, setVisibilityGroupId] = useState<string>('__all__');
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    announcementsAdminService
      .listGroups()
      .then((g) => setGroups(g.filter((x) => x.is_active).map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    let ok = true;
    announcementsAdminService
      .get(id)
      .then((a) => {
        if (!ok) return;
        setTitle(a.title);
        setType(a.type);
        setWhatsappMessage(a.whatsapp_message ?? '');
        setPageSummary(a.page_summary ?? '');
        setPageContent(a.page_content ?? '');
        setCategory(a.category ?? '__none__');
        setBannerUrl(a.banner_url ?? '');
        setFeatured(a.featured);
        setVersion(a.version ?? '');
        setVisibilityGroupId(a.visibility_group_id ?? '__all__');
      })
      .catch((e) => toast({ title: 'Erro', description: String(e.message), variant: 'destructive' }))
      .finally(() => {
        if (ok) setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, [id, isNew]);

  const save = async () => {
    if (!title.trim()) {
      toast({ title: 'Título obrigatório', variant: 'destructive' });
      return;
    }
    const body = {
      title: title.trim(),
      type,
      whatsapp_message: whatsappMessage,
      page_summary: type === 'whatsapp_and_updates_page' ? pageSummary || null : null,
      page_content: type === 'whatsapp_and_updates_page' ? pageContent || null : null,
      category: category === '__none__' ? null : category,
      banner_url: bannerUrl.trim() || null,
      featured,
      version: version.trim() || null,
      visibility_group_id: visibilityGroupId === '__all__' ? null : visibilityGroupId,
    };
    try {
      setSaving(true);
      if (isNew) {
        const { id: newId } = await announcementsAdminService.create(body);
        toast({ title: 'Criado' });
        navigate(`/superadmin/announcements/${newId}/edit`, { replace: true });
      } else if (id) {
        await announcementsAdminService.patch(id, body);
        toast({ title: 'Guardado' });
      }
    } catch (e) {
      toast({ title: 'Erro', description: String((e as Error).message), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">A carregar…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{isNew ? 'Novo anúncio' : 'Editar anúncio'}</h1>
        <Button variant="outline" onClick={() => navigate('/superadmin/announcements')}>
          Voltar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados</CardTitle>
          <CardDescription>Conteúdo para WhatsApp e, se aplicável, página de atualizações.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp_only">Só WhatsApp</SelectItem>
                <SelectItem value="whatsapp_and_updates_page">WhatsApp + página de atualizações</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa">Mensagem WhatsApp</Label>
            <Textarea id="wa" rows={6} value={whatsappMessage} onChange={(e) => setWhatsappMessage(e.target.value)} />
            <p className="text-xs text-muted-foreground">Pré-visualização simples: o envio usa o texto tal como está (normalização de espaços no backend).</p>
          </div>

          {type === 'whatsapp_and_updates_page' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="sum">Resumo (página)</Label>
                <Textarea id="sum" rows={3} value={pageSummary} onChange={(e) => setPageSummary(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Conteúdo completo</Label>
                <Textarea id="content" rows={12} value={pageContent} onChange={(e) => setPageContent(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="novidade">Novidade</SelectItem>
                    <SelectItem value="melhoria">Melhoria</SelectItem>
                    <SelectItem value="correcao">Correção</SelectItem>
                    <SelectItem value="aviso">Aviso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ver">Versão (opcional)</Label>
                <Input id="ver" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="ex.: 2.4.0" />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="feat" checked={featured} onCheckedChange={setFeatured} />
                <Label htmlFor="feat">Destaque</Label>
              </div>
              <div className="space-y-2">
                <Label>Visibilidade na página Atualizações</Label>
                <Select value={visibilityGroupId} onValueChange={setVisibilityGroupId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os clientes</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        Só grupo: {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se escolher um grupo, só tenants desse grupo veem a entrada em Atualizações (após publicar).
                </p>
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="banner">URL do banner (opcional)</Label>
            <Input id="banner" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://..." />
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar'}
          </Button>
        </CardContent>
      </Card>

      {!isNew && id ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pré-visualização rápida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{whatsappMessage || '—'}</div>
            {type === 'whatsapp_and_updates_page' ? (
              <div className="rounded-lg border p-3">
                <p className="font-semibold">{title || 'Título'}</p>
                <p className="text-sm text-muted-foreground mt-1">{pageSummary || 'Resumo'}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
