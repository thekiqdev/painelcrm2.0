import React, { useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Link } from "react-router-dom";
import { ExternalLink, Plus, Users } from "lucide-react";

type QueueRow = {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  is_active?: boolean;
};

export function ChatAttendanceSettingsSection() {
  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ items: QueueRow[] }>("/api/chat/queues");
      if (res.error) throw new Error(res.error);
      setQueues(res.data?.items ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar filas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const addQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await apiClient.post<QueueRow>("/api/chat/queues", { name: name.trim() });
      if (res.error) throw new Error(res.error);
      toast.success("Fila criada");
      setName("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar fila");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filas de atendimento</CardTitle>
          <CardDescription>
            Organize conversas por área (Comercial, Suporte, etc.). As filas podem ser atribuídas às conversas no Chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addQueue} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-sm text-muted-foreground">Nova fila</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Comercial"
                maxLength={80}
              />
            </div>
            <Button type="submit" disabled={saving || !name.trim()} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </form>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : queues.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma fila criada ainda.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {queues.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{q.name}</span>
                  {q.is_active === false && (
                    <span className="text-xs text-muted-foreground">Inativa</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Equipes
          </CardTitle>
          <CardDescription>
            As equipes de atendimento são as mesmas equipes da empresa. Gerencie membros e supervisores em{" "}
            <Link to="/settings?section=teams" className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-0.5">
              Configurações → Equipes
              <ExternalLink className="h-3 w-3" />
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link to="/settings?section=teams">Abrir equipes</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
