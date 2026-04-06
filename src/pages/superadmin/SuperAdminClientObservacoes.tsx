import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare, Tag, Pin, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/api/client';
import { useTenantDetail } from '@/contexts/TenantDetailContext';

interface TenantNote {
  id: string;
  tenant_id: string;
  author_id: string;
  author_email: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export default function SuperAdminClientObservacoes() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useTenantDetail();
  const [notes, setNotes] = useState<TenantNote[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNotePinned, setNewNotePinned] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [notesRes, tagsRes] = await Promise.all([
      apiClient.get<{ notes: TenantNote[] }>(`/api/superadmin/tenants/${id}/notes`),
      apiClient.get<{ tags: string[] }>(`/api/superadmin/tenants/${id}/tags`),
    ]);
    if (notesRes.data?.notes) setNotes(notesRes.data.notes);
    if (tagsRes.data?.tags) setTags(tagsRes.data.tags);
    if (notesRes.error) toast.error(notesRes.error);
    if (tagsRes.error) toast.error(tagsRes.error);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const addNote = async () => {
    if (!id || !newNoteContent.trim()) return;
    setAddingNote(true);
    const res = await apiClient.post<TenantNote>(`/api/superadmin/tenants/${id}/notes`, {
      content: newNoteContent.trim(),
      is_pinned: newNotePinned,
    });
    setAddingNote(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) setNotes((prev) => [res.data!, ...prev]);
    setNewNoteContent('');
    setNewNotePinned(false);
    toast.success('Nota adicionada.');
  };

  const togglePin = async (note: TenantNote) => {
    if (!id) return;
    const res = await apiClient.put<TenantNote>(`/api/superadmin/tenants/${id}/notes/${note.id}`, {
      is_pinned: !note.is_pinned,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_pinned: !n.is_pinned } : n)));
    toast.success(note.is_pinned ? 'Nota desfixada.' : 'Nota fixada.');
  };

  const startEdit = (note: TenantNote) => {
    setEditingNoteId(note.id);
    setEditingContent(note.content);
  };

  const saveEdit = async () => {
    if (!id || !editingNoteId || editingContent.trim() === '') return;
    const res = await apiClient.put<TenantNote>(
      `/api/superadmin/tenants/${id}/notes/${editingNoteId}`,
      { content: editingContent.trim() }
    );
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setNotes((prev) => prev.map((n) => (n.id === editingNoteId ? { ...n, content: res.data!.content } : n)));
    setEditingNoteId(null);
    setEditingContent('');
    toast.success('Nota atualizada.');
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditingContent('');
  };

  const deleteNote = async (noteId: string) => {
    if (!id || !confirm('Excluir esta nota?')) return;
    const res = await apiClient.delete(`/api/superadmin/tenants/${id}/notes/${noteId}`);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    toast.success('Nota excluída.');
  };

  const addTag = () => {
    const t = newTag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    const next = [...tags, t].sort();
    setTags(next);
    setNewTag('');
    saveTagsToApi(next);
  };

  const removeTag = (tag: string) => {
    const next = tags.filter((x) => x !== tag);
    setTags(next);
    saveTagsToApi(next);
  };

  const saveTagsToApi = async (tagsToSave: string[]) => {
    if (!id) return;
    setSavingTags(true);
    const res = await apiClient.put<{ tags: string[] }>(`/api/superadmin/tenants/${id}/tags`, {
      tags: tagsToSave,
    });
    setSavingTags(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data?.tags) setTags(res.data.tags);
    toast.success('Tags atualizadas.');
  };

  if (!tenant) return null;

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Observações</h2>
        <p className="text-sm text-muted-foreground">
          Notas internas e tags para a equipe.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Tags
              </CardTitle>
              <CardDescription>Tags para classificar esta empresa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="rounded-full p-0.5 hover:bg-muted"
                      aria-label={`Remover ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Nova tag"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  className="max-w-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={savingTags}>
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Notas
              </CardTitle>
              <CardDescription>Notas internas (visíveis apenas para Super Admin).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Nova nota..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pin-new"
                    checked={newNotePinned}
                    onCheckedChange={(c) => setNewNotePinned(c === true)}
                  />
                  <label htmlFor="pin-new" className="text-sm cursor-pointer">Fixar no topo</label>
                  <Button size="sm" onClick={addNote} disabled={addingNote || !newNoteContent.trim()}>
                    {addingNote ? 'Adicionando...' : 'Adicionar nota'}
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhuma nota ainda.</p>
                ) : (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      {editingNoteId === note.id ? (
                        <>
                          <Textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            rows={3}
                            className="resize-none"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveEdit}>Salvar</Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}>Cancelar</Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {note.author_email || 'Sem autor'} · {formatDate(note.created_at)}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => togglePin(note)}
                                title={note.is_pinned ? 'Desfixar' : 'Fixar'}
                              >
                                <Pin className={`h-3.5 w-3.5 ${note.is_pinned ? 'fill-current' : ''}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => startEdit(note)}
                                title="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => deleteNote(note.id)}
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
