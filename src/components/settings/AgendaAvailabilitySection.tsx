import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import { AgendaAvailabilityBlocksTab } from "./AgendaAvailabilityBlocksTab";
import { AgendaHolidaysTab } from "./AgendaHolidaysTab";
import { AgendaAppointmentTypesTab } from "./AgendaAppointmentTypesTab";
import { getMyTenantUsers, type TenantUser } from "@/services/tenantLimits";
import {
  getTenantAvailabilitySettings,
  patchTenantAvailabilitySettings,
  getUserAvailabilitySettings,
  patchUserAvailabilitySettings,
  type AvailabilityForm,
} from "@/services/appointmentAvailability";

const WEEKDAYS: { v: number; l: string }[] = [
  { v: 1, l: "Seg" },
  { v: 2, l: "Ter" },
  { v: 3, l: "Qua" },
  { v: 4, l: "Qui" },
  { v: 5, l: "Sex" },
  { v: 6, l: "Sáb" },
  { v: 7, l: "Dom" },
];

function emptyForm(): AvailabilityForm {
  return {
    timezone: "America/Sao_Paulo",
    slot_duration_minutes: 30,
    default_meeting_duration_minutes: 60,
    min_notice_minutes: 120,
    max_days_ahead: 30,
    capacity_per_slot: 1,
    weekdays: [1, 2, 3, 4, 5],
    work_start_time: "09:00",
    work_end_time: "18:00",
    break_start_time: "12:00",
    break_end_time: "13:00",
    block_holidays: true,
    holiday_country_code: "BR",
    holiday_state_code: null,
    holiday_city: null,
  };
}

function AvailabilityFormFields(props: {
  value: AvailabilityForm;
  onChange: (v: AvailabilityForm) => void;
  disabled?: boolean;
}) {
  const { value, onChange, disabled } = props;
  const set = (patch: Partial<AvailabilityForm>) => onChange({ ...value, ...patch });

  const toggleDay = (d: number) => {
    const has = value.weekdays.includes(d);
    const next = has ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d].sort((a, b) => a - b);
    set({ weekdays: next.length ? next : [1] });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label>Fuso horário (IANA)</Label>
        <Input
          value={value.timezone}
          onChange={(e) => set({ timezone: e.target.value })}
          disabled={disabled}
          placeholder="America/Sao_Paulo"
        />
      </div>
      <div className="space-y-2">
        <Label>Duração do slot (min)</Label>
        <Input
          type="number"
          min={10}
          max={180}
          value={value.slot_duration_minutes}
          onChange={(e) => set({ slot_duration_minutes: parseInt(e.target.value, 10) || 30 })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label>Duração padrão da reunião (min)</Label>
        <Input
          type="number"
          min={15}
          max={480}
          value={value.default_meeting_duration_minutes}
          onChange={(e) => set({ default_meeting_duration_minutes: parseInt(e.target.value, 10) || 60 })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label>Antecedência mínima (min)</Label>
        <Input
          type="number"
          min={0}
          max={10080}
          value={value.min_notice_minutes}
          onChange={(e) => set({ min_notice_minutes: parseInt(e.target.value, 10) || 0 })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label>Limite de dias à frente</Label>
        <Input
          type="number"
          min={1}
          max={365}
          value={value.max_days_ahead}
          onChange={(e) => set({ max_days_ahead: parseInt(e.target.value, 10) || 30 })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label>Capacidade por horário</Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={value.capacity_per_slot}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            set({ capacity_per_slot: Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : 1 });
          }}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Quantidade máxima de compromissos permitidos no mesmo horário para o mesmo responsável.
        </p>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Dias da semana</Label>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map(({ v, l }) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.weekdays.includes(v)}
                onCheckedChange={() => toggleDay(v)}
                disabled={disabled}
              />
              {l}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Início do expediente</Label>
        <Input
          type="time"
          value={value.work_start_time.slice(0, 5)}
          onChange={(e) => set({ work_start_time: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label>Fim do expediente</Label>
        <Input
          type="time"
          value={value.work_end_time.slice(0, 5)}
          onChange={(e) => set({ work_end_time: e.target.value })}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label>Início da pausa (opcional)</Label>
        <Input
          type="time"
          value={value.break_start_time?.slice(0, 5) ?? ""}
          onChange={(e) =>
            set({ break_start_time: e.target.value ? e.target.value : null, break_end_time: e.target.value ? value.break_end_time : null })
          }
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label>Fim da pausa (opcional)</Label>
        <Input
          type="time"
          value={value.break_end_time?.slice(0, 5) ?? ""}
          onChange={(e) => set({ break_end_time: e.target.value ? e.target.value : null })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function AgendaAvailabilitySection() {
  const { user } = useAuth();
  const { permissions, loading: permLoading } = useModulePermissions();
  const [tab, setTab] = useState<"company" | "user" | "blocks" | "holidays" | "types">("user");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [company, setCompany] = useState<AvailabilityForm>(emptyForm());
  const [userForm, setUserForm] = useState<AvailabilityForm>(emptyForm());
  const [userActive, setUserActive] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [effectiveSource, setEffectiveSource] = useState<string>("tenant");

  const elevated = useMemo(
    () => user?.role === "admin" || user?.role === "manager" || !!user?.is_tenant_admin,
    [user?.role, user?.is_tenant_admin],
  );
  const canViewCompanyAvailability = elevated || permissions.settings?.can_view === true;
  const canEditCompanyAvailability = elevated || permissions.settings?.can_edit === true;
  const canPickOtherUsers = canEditCompanyAvailability;

  const visibleTabCount = useMemo(() => {
    let n = 2;
    if (canViewCompanyAvailability) n += 2;
    if (canEditCompanyAvailability) n += 1;
    return n;
  }, [canViewCompanyAvailability, canEditCompanyAvailability]);

  const loadCompany = useCallback(async () => {
    const data = await getTenantAvailabilitySettings();
    setCompany({ ...emptyForm(), ...data.settings });
  }, []);

  const loadUser = useCallback(
    async (uid: string) => {
      const data = await getUserAvailabilitySettings(uid);
      setUserForm({ ...emptyForm(), ...(data.user_settings ?? data.company_defaults) });
      setUserActive(data.user_settings?.is_active ?? false);
      setEffectiveSource(data.effective.source);
      if (!data.user_settings) {
        setUserForm({ ...data.company_defaults });
        setUserActive(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (permLoading) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const users = await getMyTenantUsers();
        if (!alive) return;
        setTenantUsers(users);
        const selfId = user?.id ?? "";
        setSelectedUserId(selfId);
        if (canViewCompanyAvailability) {
          await loadCompany();
        }
        if (selfId) await loadUser(selfId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar disponibilidade");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, loadCompany, loadUser, permLoading, canViewCompanyAvailability]);

  useEffect(() => {
    if (permLoading) return;
    if (tab === "company" && !canViewCompanyAvailability) setTab("user");
    if (tab === "holidays" && !canEditCompanyAvailability) setTab("user");
    if (tab === "types" && !canViewCompanyAvailability) setTab("user");
  }, [permLoading, tab, canViewCompanyAvailability, canEditCompanyAvailability]);

  const onSelectUser = async (uid: string) => {
    setSelectedUserId(uid);
    setLoading(true);
    try {
      await loadUser(uid);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  const saveCompany = async () => {
    if (!canEditCompanyAvailability) {
      toast.error("A disponibilidade da empresa é gerenciada por administradores ou quem tem edição em Configurações.");
      return;
    }
    setSaving(true);
    try {
      const data = await patchTenantAvailabilitySettings(company);
      setCompany({ ...emptyForm(), ...data.settings });
      toast.success("Disponibilidade da empresa guardada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async () => {
    setSaving(true);
    try {
      const data = await patchUserAvailabilitySettings({
        user_id: canPickOtherUsers ? selectedUserId : undefined,
        timezone: userForm.timezone,
        slot_duration_minutes: userForm.slot_duration_minutes,
        default_meeting_duration_minutes: userForm.default_meeting_duration_minutes,
        min_notice_minutes: userForm.min_notice_minutes,
        max_days_ahead: userForm.max_days_ahead,
        weekdays: userForm.weekdays,
        work_start_time: userForm.work_start_time,
        work_end_time: userForm.work_end_time,
        break_start_time: userForm.break_start_time,
        break_end_time: userForm.break_end_time,
        capacity_per_slot: userForm.capacity_per_slot,
        is_active: userActive,
      });
      setUserForm({ ...emptyForm(), ...data.user_settings });
      setUserActive(data.user_settings.is_active);
      setEffectiveSource(data.effective.source);
      toast.success("Disponibilidade guardada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  if (permLoading || (loading && !tenantUsers.length)) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Disponibilidade da agenda</h2>
        <p className="text-muted-foreground text-sm">
          Integrações → Agenda: horários para remarcação pública e slots por responsável.
        </p>
      </div>

      {!canPickOtherUsers ? (
        <Alert className="border-primary/20 bg-muted/30">
          <AlertDescription>Você pode configurar apenas sua própria disponibilidade.</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "company" | "user" | "blocks" | "holidays" | "types")}>
        <TabsList
          className={`grid w-full max-w-4xl gap-1 ${visibleTabCount <= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}
        >
          {canViewCompanyAvailability ? <TabsTrigger value="company">Empresa</TabsTrigger> : null}
          <TabsTrigger value="user">{canPickOtherUsers ? "Usuários" : "Minha disponibilidade"}</TabsTrigger>
          <TabsTrigger value="blocks">Bloqueios</TabsTrigger>
          {canViewCompanyAvailability ? <TabsTrigger value="types">Tipos</TabsTrigger> : null}
          {canEditCompanyAvailability ? <TabsTrigger value="holidays">Feriados</TabsTrigger> : null}
        </TabsList>

        {canViewCompanyAvailability ? (
        <TabsContent value="company" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Disponibilidade geral</CardTitle>
              <CardDescription>
                Aplica-se a todos os responsáveis que não tiverem disponibilidade personalizada ativa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canEditCompanyAvailability ? (
                <Alert>
                  <AlertDescription>
                    A disponibilidade da empresa é gerenciada por administradores ou por utilizadores com permissão de
                    edição em Configurações.
                  </AlertDescription>
                </Alert>
              ) : null}
              <AvailabilityFormFields value={company} onChange={setCompany} disabled={!canEditCompanyAvailability} />
              <div className="flex flex-col gap-3 rounded-lg border border-border/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Bloquear agendamentos em feriados</p>
                  <p className="text-xs text-muted-foreground">
                    Slots públicos e remarcação deixam de oferecer datas em feriados ativos (conforme país na base).
                  </p>
                </div>
                <Switch
                  checked={company.block_holidays}
                  onCheckedChange={(v) => setCompany({ ...company, block_holidays: v })}
                  disabled={!canEditCompanyAvailability}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>País (feriados globais)</Label>
                  <Input value="Brasil (BR)" readOnly disabled className="bg-muted/40" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-muted-foreground">Estado / cidade (opcional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Reservado para evolução futura do calendário regional. Por agora os feriados globais seguem o país
                    configurado no servidor.
                  </p>
                </div>
              </div>
              <Button onClick={() => void saveCompany()} disabled={!canEditCompanyAvailability || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar empresa"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        ) : null}

        <TabsContent value="user" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Disponibilidade por utilizador</CardTitle>
              <CardDescription>
                Se a disponibilidade personalizada estiver desativada, será usada a disponibilidade geral da empresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canPickOtherUsers ? (
                <div className="space-y-2">
                  <Label>Utilizador</Label>
                  <Select value={selectedUserId} onValueChange={(v) => void onSelectUser(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email}
                          {u.id === user?.id ? " (eu)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">A configurar a sua disponibilidade.</p>
              )}

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Usar disponibilidade personalizada</p>
                  <p className="text-xs text-muted-foreground">Desligue para voltar às regras da empresa.</p>
                </div>
                <Switch checked={userActive} onCheckedChange={setUserActive} />
              </div>

              <Alert>
                <AlertDescription>
                  Efeito atual:{" "}
                  <strong>
                    {effectiveSource === "user" ? "personalizada" : effectiveSource === "tenant" ? "empresa" : "padrão"}
                  </strong>
                  .
                </AlertDescription>
              </Alert>

              <AvailabilityFormFields
                value={userForm}
                onChange={setUserForm}
                disabled={!userActive}
              />

              <Button onClick={() => void saveUser()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar utilizador"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blocks" className="mt-4">
          <AgendaAvailabilityBlocksTab />
        </TabsContent>

        {canViewCompanyAvailability ? (
        <TabsContent value="types" className="mt-4">
          <AgendaAppointmentTypesTab canEdit={canEditCompanyAvailability} />
        </TabsContent>
        ) : null}

        {canEditCompanyAvailability ? (
        <TabsContent value="holidays" className="mt-4">
          <AgendaHolidaysTab />
        </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
