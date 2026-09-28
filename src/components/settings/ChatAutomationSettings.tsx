import React, { useCallback, useEffect, useState } from "react";
import { chatService, type ChatBotRuleDto } from "@/services/chat";
import { teamsService, type Team } from "@/services/teams";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

const TAB_TYPES = {
  welcome: "welcome_message",
  ooh: "out_of_hours",
  menu: "menu",
  keyword: "keyword",
} as const;

function typeLabel(t: ChatBotRuleDto["type"]): string {
  switch (t) {
    case "welcome_message":
      return "Mensagem inicial";
    case "out_of_hours":
      return "Fora de horário";
    case "menu":
      return "Menu";
    case "keyword":
      return "Palavra-chave";
    default:
      return t;
  }
}

export function ChatAutomationSettingsSection() {
  const { canView, canEdit, loading: permLoading } = useModulePermissions();
  const canManage = canEdit("chat") && !permLoading;
  const showChat = canView("chat");

  const [rules, setRules] = useState<ChatBotRuleDto[]>([]);
  const [queues, setQueues] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<keyof typeof TAB_TYPES>("welcome");
  const [dialogType, setDialogType] = useState<ChatBotRuleDto["type"]>("welcome_message");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChatBotRuleDto | null>(null);
  const [formName, setFormName] = useState("");
  const [formPriority, setFormPriority] = useState(100);
  const [formText, setFormText] = useState("");
  const [formPattern, setFormPattern] = useState("");
  const [formQueueId, setFormQueueId] = useState("");
  const [formTeamId, setFormTeamId] = useState("");
  const [formAppendMenu, setFormAppendMenu] = useState(false);
  const [formMenuFollowup, setFormMenuFollowup] = useState(false);
  const [formOptionsJson, setFormOptionsJson] = useState(
    '[\n  { "label": "Comercial", "queue_id": "" }\n]',
  );
  const [formTriggerJson, setFormTriggerJson] = useState("{}");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!showChat) return;
    setLoading(true);
    try {
      const [r, q, t] = await Promise.all([
        chatService.listBotRules(),
        chatService.listQueues().catch(() => ({ items: [] as { id: string; name: string }[] })),
        teamsService.getTeams().catch(() => [] as Team[]),
      ]);
      setRules(r.items ?? []);
      setQueues((q.items ?? []).map((x) => ({ id: x.id, name: x.name })));
      setTeams(t);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar regras do chatbot");
    } finally {
      setLoading(false);
    }
  }, [showChat]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (k: keyof typeof TAB_TYPES) => {
    setDialogType(TAB_TYPES[k]);
    setEditing(null);
    setFormName("");
    setFormPriority(100);
    setFormText("");
    setFormPattern("");
    setFormQueueId("");
    setFormTeamId("");
    setFormAppendMenu(false);
    setFormMenuFollowup(false);
    setFormOptionsJson('[{ "label": "Comercial", "queue_id": "" }]');
    setFormTriggerJson("{}");
    setDialogOpen(true);
  };

  const openEdit = (r: ChatBotRuleDto) => {
    setEditing(r);
    setDialogType(r.type);
    setFormName(r.name);
    setFormPriority(r.priority);
    const ac = r.action_config || {};
    setFormText(typeof ac.text === "string" ? ac.text : "");
    const trig = r.trigger_config || {};
    setFormPattern(typeof trig.pattern === "string" ? trig.pattern : "");
    setFormQueueId(typeof ac.queue_id === "string" ? ac.queue_id : "");
    setFormTeamId(typeof ac.team_id === "string" ? ac.team_id : "");
    setFormAppendMenu(ac.append_menu === true);
    setFormMenuFollowup(ac.menu_on_followup === true);
    setFormOptionsJson(JSON.stringify(ac.options ?? [], null, 2));
    setFormTriggerJson(JSON.stringify(r.trigger_config ?? {}, null, 2));
    setDialogOpen(true);
  };

  const saveRule = async () => {
    if (!canManage) return;
    const type = dialogType;
    let trigger_config: Record<string, unknown> = {};
    try {
      trigger_config = JSON.parse(formTriggerJson || "{}") as Record<string, unknown>;
    } catch {
      toast.error("JSON inválido em «Condição (JSON)»");
      return;
    }
    if (type === "keyword" && formPattern.trim()) {
      trigger_config.pattern = formPattern.trim();
    }
    if (type === "menu") {
      trigger_config.mode = trigger_config.mode ?? "keyword";
      if (!trigger_config.keyword) trigger_config.keyword = "menu";
    }

    let options: unknown[] = [];
    try {
      options = JSON.parse(formOptionsJson || "[]") as unknown[];
    } catch {
      toast.error("JSON inválido em «Opções do menu»");
      return;
    }

    const action_config: Record<string, unknown> = {
      text: formText.trim() || undefined,
      queue_id: formQueueId || undefined,
      team_id: formTeamId || undefined,
      append_menu: type === "welcome_message" ? formAppendMenu : undefined,
      menu_on_followup: type === "welcome_message" ? formMenuFollowup : undefined,
      options: type === "menu" || (type === "welcome_message" && formAppendMenu) ? options : undefined,
    };

    setSaving(true);
    try {
      if (editing) {
        await chatService.patchBotRule(editing.id, {
          name: formName.trim(),
          priority: formPriority,
          trigger_config,
          action_config,
        });
        toast.success("Regra atualizada");
      } else {
        await chatService.createBotRule({
          name: formName.trim() || typeLabel(type),
          type,
          priority: formPriority,
          trigger_config,
          action_config,
        });
        toast.success("Regra criada");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: ChatBotRuleDto, v: boolean) => {
    if (!canManage) return;
    try {
      await chatService.patchBotRule(r.id, { is_active: v });
      setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: v } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const remove = async (id: string) => {
    if (!canManage) return;
    try {
      await chatService.deleteBotRule(id);
      toast.success("Removida");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  if (!showChat) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chatbot</CardTitle>
          <CardDescription>Sem permissão para o módulo Chat.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Automação do chat (chatbot)</h2>
        <p className="text-sm text-muted-foreground">
          Mensagem inicial, fora de horário, menu e palavras-chave. Requer migração Fase 8 e{" "}
          <code className="rounded bg-muted px-1">CHAT_AUTOMATION_ENABLED=true</code> no servidor.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as keyof typeof TAB_TYPES)} className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap gap-1">
            <TabsTrigger value="welcome">Mensagem inicial</TabsTrigger>
            <TabsTrigger value="ooh">Fora de horário</TabsTrigger>
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="keyword">Regras / palavras-chave</TabsTrigger>
          </TabsList>

          {(["welcome", "ooh", "menu", "keyword"] as const).map((k) => {
            const filtered = rules.filter((r) => r.type === TAB_TYPES[k]);
            return (
            <TabsContent key={k} value={k} className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {k === "welcome" && "Primeira mensagem do contacto na conversa."}
                  {k === "ooh" && "Quando a mensagem chega fora do horário configurado em «Condição (JSON)»."}
                  {k === "menu" && "Lista numérica e direcionamento (filas/equipas)."}
                  {k === "keyword" && "Detetar texto e opcionalmente mover para fila."}
                </p>
                {canManage ? (
                  <Button type="button" size="sm" onClick={() => openCreate(k)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova regra
                  </Button>
                ) : null}
              </div>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma regra neste separador.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {filtered.map((r) => (
                    <li key={r.id}>
                      <Card className="border-border">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base">{r.name}</CardTitle>
                            <Badge variant={r.is_active ? "default" : "secondary"}>
                              {r.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs">
                            Prioridade {r.priority} · {typeLabel(r.type)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={r.is_active}
                              disabled={!canManage}
                              onCheckedChange={(v) => void toggleActive(r, v)}
                            />
                            <span className="text-xs text-muted-foreground">Ativa</span>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(r)}>
                            Editar
                          </Button>
                          {canManage ? (
                            <Button type="button" variant="ghost" size="icon" onClick={() => void remove(r.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </CardContent>
                      </Card>
                    </li>
                    ))}
                </ul>
              )}
            </TabsContent>
            );
          })}
        </Tabs>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex.: Boas-vindas" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={formPriority}
                  onChange={(e) => setFormPriority(parseInt(e.target.value, 10) || 100)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Texto da mensagem</Label>
              <Textarea value={formText} onChange={(e) => setFormText(e.target.value)} rows={3} />
            </div>
            {dialogType === "keyword" ? (
              <div className="space-y-1">
                <Label>Padrão (regex ou texto)</Label>
                <Input value={formPattern} onChange={(e) => setFormPattern(e.target.value)} placeholder="financeiro|suporte" />
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Fila (opcional)</Label>
                <Select value={formQueueId || "__none__"} onValueChange={(v) => setFormQueueId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {queues.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Equipa (opcional)</Label>
                <Select value={formTeamId || "__none__"} onValueChange={(v) => setFormTeamId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {dialogType === "welcome_message" ? (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={formAppendMenu} onCheckedChange={setFormAppendMenu} />
                  Incluir menu numerado na mesma mensagem
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={formMenuFollowup} onCheckedChange={setFormMenuFollowup} />
                  Enviar menu na segunda mensagem (após a inicial)
                </label>
              </div>
            ) : null}
            {dialogType === "menu" || (dialogType === "welcome_message" && formAppendMenu) ? (
              <div className="space-y-1">
                <Label>Opções do menu (JSON)</Label>
                <Textarea value={formOptionsJson} onChange={(e) => setFormOptionsJson(e.target.value)} rows={6} className="font-mono text-xs" />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Condição extra (JSON)</Label>
              <Textarea value={formTriggerJson} onChange={(e) => setFormTriggerJson(e.target.value)} rows={4} className="font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">
                Fora de horário: use slots (ver documentação). Menu «após boas-vindas»:{" "}
                <code className="rounded bg-muted px-1">{`{"mode":"after_welcome"}`}</code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving || !canManage} onClick={() => void saveRule()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
