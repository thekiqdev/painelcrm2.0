import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { publicApiGet, publicApiPost } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock3, Loader2, MapPin, Video } from "lucide-react";

type PublicAppointmentPayload = {
  appointment: {
    title: string;
    starts_at: string;
    ends_at: string;
    responsible_name: string;
    company_name: string;
    meet_link: string | null;
    location: string | null;
    attendance_status: string;
    is_recurring_occurrence: boolean;
  };
  expired: boolean;
  already_responded: boolean;
};

type ConflictRow = { id: string; title: string; starts_at: string; ends_at: string };

function formatDatePt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatTimePt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Valor para input datetime-local a partir de ISO (hora local do dispositivo). */
function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function PublicAppointmentConfirmation() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicAppointmentPayload | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState<null | "confirmed" | "needs_reschedule" | "declined">(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [reschedulePhase, setReschedulePhase] = useState<null | "form" | "review">(null);
  const [rescheduleStartLocal, setRescheduleStartLocal] = useState("");
  const [rescheduleEndLocal, setRescheduleEndLocal] = useState("");
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHasConflict, setPreviewHasConflict] = useState(false);
  const [previewConflicts, setPreviewConflicts] = useState<ConflictRow[]>([]);
  const [rescheduleIso, setRescheduleIso] = useState<{ start: string; end: string } | null>(null);
  const [publicSlots, setPublicSlots] = useState<{ starts_at: string; ends_at: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotDurationMin, setSlotDurationMin] = useState(60);

  const encodedToken = useMemo(() => encodeURIComponent((token || "").trim()), [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token?.trim()) {
        setError("Link inválido.");
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await publicApiGet<PublicAppointmentPayload>(`/api/public/appointments/confirm/${encodedToken}`);
      if (!active) return;
      if (res.error || !res.data) {
        setError(res.error || "Não foi possível abrir o link.");
        setData(null);
      } else {
        setData(res.data);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [encodedToken, token]);

  function startRescheduleFlow() {
    if (!data) return;
    setError(null);
    setReschedulePhase("form");
    setRescheduleNote(note.trim());
    setRescheduleStartLocal(isoToDatetimeLocalValue(data.appointment.starts_at));
    setRescheduleEndLocal(isoToDatetimeLocalValue(data.appointment.ends_at));
    setPreviewHasConflict(false);
    setPreviewConflicts([]);
    setRescheduleIso(null);
    setPublicSlots([]);
    setSlotsLoading(true);
    void publicApiGet<{
      slots: { starts_at: string; ends_at: string }[];
      default_meeting_duration_minutes: number;
    }>(`/api/public/appointments/confirm/${encodedToken}/availability`).then((res) => {
      setSlotsLoading(false);
      if (res.data) {
        setPublicSlots(res.data.slots || []);
        setSlotDurationMin(res.data.default_meeting_duration_minutes ?? 60);
      }
    });
  }

  function cancelRescheduleFlow() {
    setReschedulePhase(null);
    setPreviewLoading(false);
    setPreviewHasConflict(false);
    setPreviewConflicts([]);
    setRescheduleIso(null);
  }

  async function goToRescheduleReview() {
    const s = datetimeLocalToIso(rescheduleStartLocal);
    const e = datetimeLocalToIso(rescheduleEndLocal);
    if (!s || !e) {
      setError("Preencha data e horário de início e fim.");
      return;
    }
    if (new Date(e).getTime() <= new Date(s).getTime()) {
      setError("O horário final deve ser depois do início.");
      return;
    }
    const durMin = (new Date(e).getTime() - new Date(s).getTime()) / 60_000;
    if (Math.abs(durMin - slotDurationMin) > 0.5) {
      setError(`A duração deve ser de ${slotDurationMin} minutos conforme a disponibilidade do responsável.`);
      return;
    }
    if (new Date(s).getTime() < Date.now() - 60_000) {
      setError("Escolha uma data e horário no futuro.");
      return;
    }

    setError(null);
    setPreviewLoading(true);
    const q = `starts_at=${encodeURIComponent(s)}&ends_at=${encodeURIComponent(e)}`;
    const res = await publicApiGet<{ has_conflict: boolean; conflicts: ConflictRow[] }>(
      `/api/public/appointments/confirm/${encodedToken}/reschedule-conflicts?${q}`,
    );
    setPreviewLoading(false);
    if (res.error || !res.data) {
      setError(res.error || "Não foi possível verificar disponibilidade.");
      return;
    }
    setRescheduleIso({ start: s, end: e });
    setPreviewHasConflict(res.data.has_conflict);
    setPreviewConflicts(res.data.conflicts || []);
    setReschedulePhase("review");
  }

  async function submitRescheduleFinal() {
    if (!token?.trim() || !rescheduleIso) return;
    setSending("needs_reschedule");
    setError(null);
    const res = await publicApiPost<{
      ok: boolean;
      rescheduled?: boolean;
      has_conflict?: boolean;
    }>(`/api/public/appointments/confirm/${encodedToken}`, {
      response: "needs_reschedule",
      starts_at: rescheduleIso.start,
      ends_at: rescheduleIso.end,
      note: rescheduleNote.trim() || null,
    });
    setSending(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSuccess("Seu compromisso foi remarcado com sucesso.");
    setReschedulePhase(null);
    setData((prev) =>
      prev
        ? {
            ...prev,
            already_responded: true,
            appointment: {
              ...prev.appointment,
              starts_at: rescheduleIso.start,
              ends_at: rescheduleIso.end,
              attendance_status: "confirmed",
            },
          }
        : prev,
    );
  }

  async function submit(response: "confirmed" | "needs_reschedule" | "declined") {
    if (!token?.trim()) return;
    if (response === "needs_reschedule") {
      startRescheduleFlow();
      return;
    }
    setSending(response);
    setError(null);
    const res = await publicApiPost<{ ok: boolean }>(`/api/public/appointments/confirm/${encodedToken}`, {
      response,
      note: note.trim() || null,
    });
    setSending(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSuccess(
      response === "confirmed"
        ? "Presença confirmada com sucesso."
        : "Resposta registrada com sucesso.",
    );
    setData((prev) =>
      prev
        ? {
            ...prev,
            already_responded: true,
            appointment: {
              ...prev.appointment,
              attendance_status: response === "confirmed" ? "confirmed" : "not_confirmed",
            },
          }
        : prev,
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">{error || "Link indisponível."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const blocked = data.expired || data.already_responded || !!success;
  const inReschedule = reschedulePhase !== null && !success;

  return (
    <div className="min-h-screen bg-muted/20 py-6 px-4">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Confirmação de compromisso</CardTitle>
          <p className="text-sm text-muted-foreground">{data.appointment.company_name}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.expired ? (
            <Alert>
              <AlertDescription>Este link expirou e não aceita novas respostas.</AlertDescription>
            </Alert>
          ) : null}
          {data.already_responded && !success ? (
            <Alert>
              <AlertDescription>Este link já recebeu uma resposta anteriormente.</AlertDescription>
            </Alert>
          ) : null}
          {success ? (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {data.appointment.is_recurring_occurrence ? (
            <p className="text-xs text-muted-foreground">
              Este compromisso faz parte de uma série: a remarcação vale apenas para esta ocorrência.
            </p>
          ) : null}

          <div className="rounded-lg border p-4 space-y-2">
            <p className="font-semibold">{data.appointment.title}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" /> {formatDatePt(data.appointment.starts_at)}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock3 className="h-4 w-4" /> {formatTimePt(data.appointment.starts_at)} -{" "}
              {formatTimePt(data.appointment.ends_at)}
            </p>
            <p className="text-sm text-muted-foreground">Responsável: {data.appointment.responsible_name}</p>
            {data.appointment.location ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {data.appointment.location}
              </p>
            ) : null}
            {data.appointment.meet_link ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2 break-all">
                <Video className="h-4 w-4" /> {data.appointment.meet_link}
              </p>
            ) : null}
          </div>

          {inReschedule && reschedulePhase === "form" ? (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">Escolha uma nova data e horário para este compromisso.</p>
              {slotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> A carregar horários disponíveis…
                </div>
              ) : publicSlots.length > 0 ? (
                <div className="space-y-2">
                  <Label>Horários livres sugeridos</Label>
                  <div className="max-h-48 overflow-y-auto flex flex-wrap gap-2">
                    {publicSlots.map((sl) => (
                      <Button
                        key={sl.starts_at}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setRescheduleStartLocal(isoToDatetimeLocalValue(sl.starts_at));
                          setRescheduleEndLocal(isoToDatetimeLocalValue(sl.ends_at));
                        }}
                      >
                        {formatDatePt(sl.starts_at)} {formatTimePt(sl.starts_at)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Os intervalos refletem a disponibilidade do responsável (ou da empresa, se não houver regra
                    personalizada).
                  </p>
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="rs-start">Início</Label>
                  <Input
                    id="rs-start"
                    type="datetime-local"
                    value={rescheduleStartLocal}
                    onChange={(e) => setRescheduleStartLocal(e.target.value)}
                    disabled={blocked}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rs-end">Fim</Label>
                  <Input
                    id="rs-end"
                    type="datetime-local"
                    value={rescheduleEndLocal}
                    onChange={(e) => setRescheduleEndLocal(e.target.value)}
                    disabled={blocked}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rs-note">Observação (opcional)</Label>
                <Textarea
                  id="rs-note"
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                  placeholder="Ex.: Prefiro esse novo horário."
                  maxLength={2000}
                  disabled={blocked}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={cancelRescheduleFlow} disabled={blocked || previewLoading}>
                  Voltar
                </Button>
                <Button type="button" onClick={() => void goToRescheduleReview()} disabled={blocked || previewLoading}>
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
                </Button>
              </div>
            </div>
          ) : null}

          {inReschedule && reschedulePhase === "review" && rescheduleIso ? (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">Confirmar remarcação</p>
              <p className="text-sm text-muted-foreground">
                Novo horário:{" "}
                <span className="font-medium text-foreground">
                  {formatDatePt(rescheduleIso.start)} às {formatTimePt(rescheduleIso.start)}
                </span>{" "}
                — {formatTimePt(rescheduleIso.end)}
              </p>
              {previewHasConflict ? (
                <Alert>
                  <AlertDescription>
                    Este horário pode estar indisponível na agenda do responsável (há outro compromisso sobreposto).
                    Mesmo assim deseja solicitar essa remarcação? Confirme abaixo.
                  </AlertDescription>
                </Alert>
              ) : null}
              {previewConflicts.length > 0 ? (
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                  {previewConflicts.map((c) => (
                    <li key={c.id}>
                      {c.title} ({formatDatePt(c.starts_at)} {formatTimePt(c.starts_at)})
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setReschedulePhase("form");
                    setError(null);
                  }}
                  disabled={!!sending}
                >
                  Voltar
                </Button>
                <Button type="button" onClick={() => void submitRescheduleFinal()} disabled={!!sending}>
                  {sending === "needs_reschedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar remarcação"}
                </Button>
              </div>
            </div>
          ) : null}

          {!inReschedule ? (
            <>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Mensagem ou observação (opcional)"
                maxLength={2000}
                disabled={blocked}
              />

              <div className="grid gap-2 sm:grid-cols-3">
                <Button disabled={blocked || sending !== null} onClick={() => void submit("confirmed")}>
                  {sending === "confirmed" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar presença"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={blocked || sending !== null}
                  onClick={() => void submit("needs_reschedule")}
                >
                  Preciso remarcar
                </Button>
                <Button variant="outline" disabled={blocked || sending !== null} onClick={() => void submit("declined")}>
                  {sending === "declined" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Não poderei comparecer"}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
