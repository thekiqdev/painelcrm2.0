import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { chatService, type ChatConversation } from "@/services/chat";
import { clientsService } from "@/services/clients";
import { searchLeadsForPicker } from "@/services/leadsPicker";
import { toast } from "sonner";
import { Loader2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

function msisdnDigitsFromRaw(raw: unknown): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 15) return null;
  if (d.length <= 11 && !d.startsWith("55")) return `55${d}`;
  return d;
}

export function extractClientMsisdnForCreateGroup(conv: ChatConversation | null): string | null {
  if (!conv) return null;
  const ext = conv.external_chat_id?.trim() ?? "";
  if (ext.toLowerCase().endsWith("@s.whatsapp.net")) {
    const p = ext.split("@")[0] || "";
    const m = msisdnDigitsFromRaw(p);
    if (m) return m;
  }
  for (const raw of [conv.phoneNumber, conv.canonical_phone, conv.canonicalPhone]) {
    const m = msisdnDigitsFromRaw(raw);
    if (m) return m;
  }
  return null;
}

/** Inclui telefone do CRM e linha formatada da identidade quando a linha da conversa vem vazia. */
export function resolveClientMsisdnForCreateGroup(
  conv: ChatConversation | null,
  opts?: { crmPhone?: string | null; identityPhoneLine?: string | null },
): string | null {
  return (
    extractClientMsisdnForCreateGroup(conv) ||
    msisdnDigitsFromRaw(opts?.crmPhone) ||
    msisdnDigitsFromRaw(opts?.identityPhoneLine)
  );
}

type ParticipantSource = "team" | "client" | "lead" | "manual";

type Row = {
  key: string;
  phone: string;
  label: string;
  source: ParticipantSource;
  locked?: boolean;
};

function sourceLabel(s: ParticipantSource): string {
  switch (s) {
    case "team":
      return "Equipe";
    case "client":
      return "Cliente";
    case "lead":
      return "Lead";
    default:
      return "Manual";
  }
}

export type CreateGroupFromConversationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversation: ChatConversation | null;
  /** MSISDN já resolvido no ecrã do chat (conversa + CRM + identidade); evita lista de participantes vazia. */
  resolvedClientMsisdn?: string | null;
  onCreated: (conversation: ChatConversation) => void;
};

export function CreateGroupFromConversationDialog(props: CreateGroupFromConversationDialogProps) {
  const { open, onOpenChange, conversationId, conversation, resolvedClientMsisdn, onCreated } = props;
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([]);
  const [teamUsers, setTeamUsers] = React.useState<
    { id: string; display_name: string; email: string; whatsapp_digits: string | null }[]
  >([]);
  const [loadingTeam, setLoadingTeam] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [manualPhone, setManualPhone] = React.useState("");
  const [clientSearch, setClientSearch] = React.useState("");
  const [clientHits, setClientHits] = React.useState<Awaited<ReturnType<typeof clientsService.getClients>>>([]);
  const [leadSearch, setLeadSearch] = React.useState("");
  const [leadHits, setLeadHits] = React.useState<Awaited<ReturnType<typeof searchLeadsForPicker>>>([]);
  const [dupOpen, setDupOpen] = React.useState(false);

  const displayTitle =
    conversation?.displayName?.trim() ||
    conversation?.profileName?.trim() ||
    conversation?.contactName?.trim() ||
    "Contacto";

  const clientMsisdn = React.useMemo(() => {
    const fromProp = resolvedClientMsisdn ? msisdnDigitsFromRaw(resolvedClientMsisdn) : null;
    if (fromProp) return fromProp;
    return extractClientMsisdnForCreateGroup(conversation);
  }, [conversation, resolvedClientMsisdn]);

  React.useEffect(() => {
    if (!open) return;
    setName(`Atendimento - ${displayTitle}`.slice(0, 100));
    setDescription("");
    setManualPhone("");
    setClientSearch("");
    setLeadSearch("");
    setClientHits([]);
    setLeadHits([]);
    setDupOpen(false);
    if (clientMsisdn) {
      setRows([
        {
          key: "client",
          phone: clientMsisdn,
          label: displayTitle,
          source: "client",
          locked: true,
        },
      ]);
    } else {
      setRows([]);
    }
  }, [open, conversationId, clientMsisdn, displayTitle]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingTeam(true);
    chatService
      .getChatTenantUsersForGroup()
      .then((items) => {
        if (!cancelled) setTeamUsers(items);
      })
      .catch(() => {
        if (!cancelled) toast.error("Não foi possível carregar a equipa");
      })
      .finally(() => {
        if (!cancelled) setLoadingTeam(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || clientSearch.trim().length < 2) {
      setClientHits([]);
      return;
    }
    const t = setTimeout(() => {
      void clientsService
        .getClients({ q: clientSearch.trim() })
        .then(setClientHits)
        .catch(() => setClientHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [open, clientSearch]);

  React.useEffect(() => {
    if (!open || leadSearch.trim().length < 2) {
      setLeadHits([]);
      return;
    }
    const t = setTimeout(() => {
      void searchLeadsForPicker(leadSearch.trim()).then(setLeadHits).catch(() => setLeadHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [open, leadSearch]);

  const addRow = (phone: string, label: string, source: ParticipantSource) => {
    const p = phone.replace(/\D/g, "");
    if (!p) return;
    setRows((prev) => {
      if (prev.some((r) => r.phone.replace(/\D/g, "") === p)) return prev;
      return [...prev, { key: `${source}-${p}-${Date.now()}`, phone: p, label, source }];
    });
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key || !r.locked));
  };

  const toggleTeamUser = (u: (typeof teamUsers)[0], checked: boolean) => {
    if (!u.whatsapp_digits) return;
    if (checked) addRow(u.whatsapp_digits, u.display_name, "team");
    else {
      setRows((prev) => prev.filter((r) => !(r.source === "team" && r.phone === u.whatsapp_digits)));
    }
  };

  const submit = async (confirmDuplicate: boolean) => {
    if (!name.trim()) {
      toast.error("Indique o nome do grupo");
      return;
    }
    if (!clientMsisdn) {
      toast.error("Esta conversa não tem telefone WhatsApp detetável para incluir o contacto.");
      return;
    }
    const participants = rows.map((r) => ({ phone: r.phone, source: r.source }));
    setSubmitting(true);
    try {
      const conv = await chatService.postCreateGroupFromConversation(conversationId, {
        name: name.trim(),
        description: description.trim() || null,
        participants,
        confirmDuplicate: confirmDuplicate || undefined,
      });
      toast.success("Grupo criado");
      onOpenChange(false);
      onCreated(conv);
    } catch (e: unknown) {
      const err = e as Error & { code?: string; status?: number };
      if (err.code === "DUPLICATE_GROUP_FROM_CONVERSATION" && !confirmDuplicate) {
        setDupOpen(true);
        return;
      }
      toast.error(err.message || "Não foi possível criar o grupo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-hidden gap-0 p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Criar grupo com este cliente</DialogTitle>
            <DialogDescription>
              O contacto desta conversa entra no grupo. Pode acrescentar membros da equipa, clientes, leads ou números
              manuais.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[min(65vh,520px)] px-4">
            <div className="space-y-4 pb-4">
              {!clientMsisdn ? (
                <p className="text-sm text-destructive">
                  Não foi possível detetar o número WhatsApp desta conversa. Criação indisponível até existir telefone
                  ou JID válido.
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="cg-name">Nome do grupo</Label>
                <Input id="cg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cg-desc">Descrição (opcional)</Label>
                <Textarea
                  id="cg-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={512}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Participantes</p>
                <div className="space-y-2 rounded-lg border border-border/70 p-2">
                  {rows.map((r) => (
                    <div
                      key={r.key}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.label}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{r.phone}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {sourceLabel(r.source)}
                        </Badge>
                        {!r.locked ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Remover"
                            onClick={() => removeRow(r.key)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Equipa</p>
                {loadingTeam ? (
                  <p className="text-xs text-muted-foreground">A carregar…</p>
                ) : (
                  <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-border/50 p-2">
                    {teamUsers.map((u) => {
                      const hasWa = Boolean(u.whatsapp_digits);
                      const checked = rows.some((r) => r.phone === u.whatsapp_digits && r.source === "team");
                      return (
                        <label
                          key={u.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-2 text-sm",
                            !hasWa && "cursor-not-allowed opacity-50",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={!hasWa}
                            onCheckedChange={(c) => toggleTeamUser(u, c === true)}
                          />
                          <span className="min-w-0">
                            <span className="font-medium">{u.display_name}</span>
                            {!hasWa ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">Sem WhatsApp no perfil</span>
                            ) : (
                              <span className="block font-mono text-xs text-muted-foreground">{u.whatsapp_digits}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cliente (pesquisar)</Label>
                  <Input
                    placeholder="Nome ou email…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  <div className="max-h-28 overflow-y-auto rounded border border-border/50 text-sm">
                    {clientHits.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-muted/60"
                        onClick={() => {
                          const ph = String(c.phone || "").replace(/\D/g, "");
                          if (ph.length < 10) {
                            toast.error("Este cliente não tem telefone válido");
                            return;
                          }
                          addRow(ph, c.name || "Cliente", "client");
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Lead (pesquisar)</Label>
                  <Input
                    placeholder="Nome…"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                  />
                  <div className="max-h-28 overflow-y-auto rounded border border-border/50 text-sm">
                    {leadHits.slice(0, 8).map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-muted/60"
                        onClick={() => {
                          const ph = String(l.phone || "").replace(/\D/g, "");
                          if (ph.length < 10) {
                            toast.error("Este lead não tem telefone válido");
                            return;
                          }
                          addRow(ph, l.name || "Lead", "lead");
                        }}
                      >
                        <span className="font-medium">{l.name}</span>
                        <span className="text-xs text-muted-foreground">{l.phone}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label>Número manual</Label>
                  <Input
                    placeholder="Ex.: 5511999999999"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 gap-1"
                  onClick={() => {
                    addRow(manualPhone, manualPhone.trim() || "Manual", "manual");
                    setManualPhone("");
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="border-t border-border px-4 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={submitting || !clientMsisdn || !name.trim()}
              onClick={() => void submit(false)}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grupo já criado desta conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um grupo criado a partir desta conversa. Deseja criar outro grupo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setDupOpen(false);
                void submit(true);
              }}
            >
              Criar outro grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
