import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import { ServiceOrderItemsEditor } from "@/components/service-orders/ServiceOrderItemsEditor";
import { clientsService, type Client } from "@/services/clients";
import { clientAddressesService } from "@/services/clientAddresses";
import { productsService } from "@/services/products";
import type { Product } from "@/types/products";
import type { ClientAddress } from "@/types/clientAddresses";
import { formatClientAddressLine } from "@/types/clientAddresses";
import type {
  CreateServiceOrderInput,
  ServiceOrder,
  ServiceOrderBillingMode,
  ServiceOrderEquipment,
  ServiceOrderItem,
  UpdateServiceOrderInput,
} from "@/types/serviceOrders";
import { normalizeServiceOrderEquipmentList } from "@/types/serviceOrders";
import { formatCepMask, lookupViaCep, onlyDigits } from "@/lib/viacep";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type EquipmentDraft = {
  key: string;
  name: string;
  brand: string;
  model: string;
  serial: string;
  defects: string;
};

function emptyEquipmentDraft(): EquipmentDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    brand: "",
    model: "",
    serial: "",
    defects: "",
  };
}

function equipmentDraftsFromInitial(
  equipment: ServiceOrder["equipment"],
): EquipmentDraft[] {
  return normalizeServiceOrderEquipmentList(equipment).map((eq) => ({
    key: crypto.randomUUID(),
    name: String(eq.name ?? ""),
    brand: String(eq.brand ?? ""),
    model: String(eq.model ?? ""),
    serial: String(eq.serial ?? ""),
    defects: String(eq.defects ?? ""),
  }));
}

function draftsToEquipmentPayload(drafts: EquipmentDraft[]): ServiceOrderEquipment[] | null {
  const items = drafts
    .map((d) => ({
      name: d.name.trim() || null,
      brand: d.brand.trim() || null,
      model: d.model.trim() || null,
      serial: d.serial.trim() || null,
      defects: d.defects.trim() || null,
    }))
    .filter((eq) => eq.name || eq.brand || eq.model || eq.serial || eq.defects);
  return items.length ? items : null;
}

function equipmentRowLabel(eq: EquipmentDraft): string {
  const title = [eq.name.trim(), eq.brand.trim()].filter(Boolean).join(" · ");
  const detail = [eq.model.trim(), eq.serial.trim()].filter(Boolean).join(" / ");
  if (title && detail) return `${title} — ${detail}`;
  if (title) return title;
  if (detail) return detail;
  return "Equipamento sem identificação";
}

function isEquipmentDraftFilled(eq: EquipmentDraft): boolean {
  return Boolean(
    eq.name.trim() ||
      eq.brand.trim() ||
      eq.model.trim() ||
      eq.serial.trim() ||
      eq.defects.trim(),
  );
}

const MANUAL_ADDRESS = "__manual__";

type ExecutionAddressFields = {
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

function clientToSnapshot(client: Client): Record<string, unknown> {
  return {
    name: client.name,
    trade_name: client.company ?? null,
    document: client.cpf_cnpj ?? null,
    email: client.email ?? null,
    phone: client.phone ?? null,
    whatsapp: client.whatsapp ?? null,
  };
}

function localDatetimeToIso(date: string, time: string): string | null {
  const d = date.trim();
  if (!d) return null;
  const t = time.trim() || "00:00";
  const parsed = new Date(`${d}T${t}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isoToLocalParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function normalizeItemsFromOrder(order?: ServiceOrder | null): ServiceOrderItem[] {
  if (!order?.items?.length) return [];
  return order.items.map((it, idx) => ({
    id: it.id,
    kind: it.kind,
    product_id: it.product_id ?? null,
    name: it.name,
    description: it.description ?? null,
    unit: it.unit ?? "UN",
    quantity: Number(it.quantity) || 1,
    unit_price_cents: Number(it.unit_price_cents) || 0,
    discount_cents: Number(it.discount_cents) || 0,
    subtotal_cents: Number(it.subtotal_cents) || 0,
    sort_order: it.sort_order ?? idx,
  }));
}

function emptyAddressFields(): ExecutionAddressFields {
  return {
    postal_code: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  };
}

function parseExecutionAddress(raw: unknown): ExecutionAddressFields {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const street = String(a.street ?? "").trim();
  const number = String(a.number ?? "").trim();
  const complement = String(a.complement ?? "").trim();
  const neighborhood = String(a.neighborhood ?? "").trim();
  const city = String(a.city ?? "").trim();
  const state = String(a.state ?? "").trim().toUpperCase();
  const postal = formatCepMask(String(a.postal_code ?? ""));

  if (street || city || postal) {
    return {
      postal_code: postal,
      street,
      number,
      complement,
      neighborhood,
      city,
      state: state.slice(0, 2),
    };
  }

  // Legacy: line + city_uf
  const line = String(a.line ?? "").trim();
  const cityUf = String(a.city_uf ?? "").trim();
  let legacyCity = "";
  let legacyState = "";
  if (cityUf.includes("/")) {
    const [c, uf] = cityUf.split("/");
    legacyCity = (c || "").trim();
    legacyState = (uf || "").trim().toUpperCase().slice(0, 2);
  } else if (cityUf) {
    legacyCity = cityUf;
  }
  return {
    postal_code: postal,
    street: line,
    number: "",
    complement: "",
    neighborhood: "",
    city: legacyCity,
    state: legacyState,
  };
}

function buildLineFromFields(f: ExecutionAddressFields): string {
  const streetPart = [f.street.trim(), f.number.trim()].filter(Boolean).join(", ");
  const withCompl = [streetPart, f.complement.trim()].filter(Boolean).join(" — ");
  const withBairro = [withCompl, f.neighborhood.trim()].filter(Boolean).join(" · ");
  return withBairro;
}

function buildCityUf(f: ExecutionAddressFields): string {
  return [f.city.trim(), f.state.trim().toUpperCase()].filter(Boolean).join("/");
}

function applyClientAddress(a: ClientAddress): ExecutionAddressFields {
  return {
    postal_code: a.postal_code ? formatCepMask(a.postal_code) : "",
    street: a.street || "",
    number: a.number || "",
    complement: a.complement || "",
    neighborhood: a.neighborhood || "",
    city: a.city || "",
    state: (a.state || "").toUpperCase().slice(0, 2),
  };
}

function toExecutionAddressPayload(
  f: ExecutionAddressFields,
  clientAddressId: string | null,
): Record<string, unknown> {
  return {
    postal_code: f.postal_code.trim() || null,
    street: f.street.trim() || null,
    number: f.number.trim() || null,
    complement: f.complement.trim() || null,
    neighborhood: f.neighborhood.trim() || null,
    city: f.city.trim() || null,
    state: f.state.trim().toUpperCase() || null,
    line: buildLineFromFields(f) || null,
    city_uf: buildCityUf(f) || null,
    client_address_id: clientAddressId,
  };
}

export type ServiceOrderFormProps = {
  mode: "create" | "edit";
  initial?: ServiceOrder | null;
  initialClientId?: string | null;
  lockClientPicker?: boolean;
  submitting?: boolean;
  onSubmit: (payload: CreateServiceOrderInput | UpdateServiceOrderInput) => Promise<void> | void;
  onCancel?: () => void;
};

export function ServiceOrderForm({
  mode,
  initial,
  initialClientId,
  lockClientPicker = false,
  submitting = false,
  onSubmit,
  onCancel,
}: ServiceOrderFormProps) {
  const [clientId, setClientId] = useState<string | null>(
    initial?.client_id ?? initialClientId ?? null,
  );
  const [clientLabel, setClientLabel] = useState("");
  const [clientSnapshot, setClientSnapshot] = useState<Record<string, unknown>>(
    initial?.client_snapshot ?? {},
  );
  const [addr, setAddr] = useState<ExecutionAddressFields>(() =>
    parseExecutionAddress(initial?.execution_address),
  );
  const [clientAddresses, setClientAddresses] = useState<ClientAddress[]>([]);
  const [addressSelect, setAddressSelect] = useState<string>(() => {
    const raw = initial?.execution_address as { client_address_id?: string } | undefined;
    return raw?.client_address_id || MANUAL_ADDRESS;
  });
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepHint, setCepHint] = useState<string | null>(null);
  const lastCepLookup = useRef("");
  const addrRef = useRef(addr);
  addrRef.current = addr;
  /** Evita sobrescrever endereço já editado na abertura em modo edit. */
  const skipNextClientAddressPrefill = useRef(mode === "edit" && Boolean(initial?.execution_address));

  const [periodStartDate, setPeriodStartDate] = useState(
    () => isoToLocalParts(initial?.period_start_at).date,
  );
  const [periodStartTime, setPeriodStartTime] = useState(
    () => isoToLocalParts(initial?.period_start_at).time,
  );
  const [periodEndDate, setPeriodEndDate] = useState(
    () => isoToLocalParts(initial?.period_end_at).date,
  );
  const [periodEndTime, setPeriodEndTime] = useState(
    () => isoToLocalParts(initial?.period_end_at).time,
  );
  const [equipmentDrafts, setEquipmentDrafts] = useState<EquipmentDraft[]>(() =>
    equipmentDraftsFromInitial(initial?.equipment),
  );
  const [equipmentEditorOpen, setEquipmentEditorOpen] = useState(false);
  const [equipmentEditorMode, setEquipmentEditorMode] = useState<"add" | "edit">("add");
  const [equipmentEditingKey, setEquipmentEditingKey] = useState<string | null>(null);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentDraft>(() => emptyEquipmentDraft());
  const [equipmentExpandedKey, setEquipmentExpandedKey] = useState<string | null>(null);
  const [observations, setObservations] = useState(initial?.observations ?? "");
  const [billingMode, setBillingMode] = useState<ServiceOrderBillingMode>(
    initial?.billing_mode ?? "manual",
  );
  const [items, setItems] = useState<ServiceOrderItem[]>(() => normalizeItemsFromOrder(initial));
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await productsService.getProducts();
        if (!cancelled) setCatalog(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setCatalog([]);
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hydrateClient = useCallback(async (id: string | null) => {
    if (!id) {
      setClientLabel("");
      setClientSnapshot({});
      return;
    }
    try {
      const c = await clientsService.getClientById(id);
      if (!c) return;
      setClientLabel([c.name, c.company].filter(Boolean).join(" · "));
      setClientSnapshot(clientToSnapshot(c));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void hydrateClient(clientId);
  }, [clientId, hydrateClient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clientId) {
        setClientAddresses([]);
        setAddressSelect(MANUAL_ADDRESS);
        return;
      }
      setLoadingAddresses(true);
      try {
        const list = await clientAddressesService.list(clientId);
        if (cancelled) return;
        setClientAddresses(list);

        if (skipNextClientAddressPrefill.current) {
          skipNextClientAddressPrefill.current = false;
          const linked = (initial?.execution_address as { client_address_id?: string } | undefined)
            ?.client_address_id;
          if (linked && list.some((a) => a.id === linked)) {
            setAddressSelect(linked);
          } else {
            setAddressSelect(MANUAL_ADDRESS);
          }
          return;
        }

        const def = list.find((a) => a.is_default) || (list.length === 1 ? list[0] : null);
        if (def) {
          setAddressSelect(def.id);
          setAddr(applyClientAddress(def));
          lastCepLookup.current = onlyDigits(def.postal_code || "");
          setCepHint(null);
        } else {
          setAddressSelect(MANUAL_ADDRESS);
          if (mode === "create") {
            setAddr(emptyAddressFields());
            lastCepLookup.current = "";
          }
        }
      } catch {
        if (!cancelled) {
          setClientAddresses([]);
          setAddressSelect(MANUAL_ADDRESS);
        }
      } finally {
        if (!cancelled) setLoadingAddresses(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, initial?.execution_address, mode]);

  useEffect(() => {
    const digits = onlyDigits(addr.postal_code);
    if (digits.length !== 8) {
      setCepHint(null);
      return;
    }
    if (digits === lastCepLookup.current) return;
    if (addressSelect !== MANUAL_ADDRESS) {
      lastCepLookup.current = digits;
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setCepLoading(true);
        setCepHint(null);
        const found = await lookupViaCep(digits);
        if (cancelled) return;
        setCepLoading(false);
        lastCepLookup.current = digits;
        if (!found) {
          setCepHint("CEP não encontrado — preencha manualmente");
          return;
        }
        const cur = addrRef.current;
        setAddr({
          ...cur,
          postal_code: found.postal_code,
          street: found.street || cur.street,
          complement: found.complement || cur.complement,
          neighborhood: found.neighborhood || cur.neighborhood,
          city: found.city || cur.city,
          state: found.state || cur.state,
        });
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [addr.postal_code, addressSelect]);

  const patchAddr = (partial: Partial<ExecutionAddressFields>) => {
    setAddr((prev) => ({ ...prev, ...partial }));
  };

  const onAddressSelectChange = (v: string) => {
    setAddressSelect(v);
    setCepHint(null);
    if (v === MANUAL_ADDRESS) {
      lastCepLookup.current = "";
      return;
    }
    const found = clientAddresses.find((a) => a.id === v);
    if (found) {
      setAddr(applyClientAddress(found));
      lastCepLookup.current = onlyDigits(found.postal_code || "");
    }
  };

  const equipmentPayload = useMemo(
    () => draftsToEquipmentPayload(equipmentDrafts),
    [equipmentDrafts],
  );

  const closeEquipmentEditor = useCallback(() => {
    setEquipmentEditorOpen(false);
    setEquipmentEditingKey(null);
    setEquipmentForm(emptyEquipmentDraft());
  }, []);

  const openAddEquipmentEditor = useCallback(() => {
    setEquipmentEditorMode("add");
    setEquipmentEditingKey(null);
    setEquipmentForm(emptyEquipmentDraft());
    setEquipmentEditorOpen(true);
  }, []);

  const openEditEquipmentEditor = useCallback((eq: EquipmentDraft) => {
    setEquipmentEditorMode("edit");
    setEquipmentEditingKey(eq.key);
    setEquipmentForm({ ...eq });
    setEquipmentEditorOpen(true);
  }, []);

  const saveEquipmentEditor = useCallback(() => {
    if (!isEquipmentDraftFilled(equipmentForm)) return;
    if (equipmentEditorMode === "edit" && equipmentEditingKey) {
      setEquipmentDrafts((prev) =>
        prev.map((d) => (d.key === equipmentEditingKey ? { ...equipmentForm, key: d.key } : d)),
      );
    } else {
      setEquipmentDrafts((prev) => [...prev, { ...equipmentForm, key: crypto.randomUUID() }]);
    }
    closeEquipmentEditor();
  }, [closeEquipmentEditor, equipmentEditorMode, equipmentEditingKey, equipmentForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientAddressId = addressSelect !== MANUAL_ADDRESS ? addressSelect : null;
    const payload: CreateServiceOrderInput = {
      client_id: clientId,
      client_snapshot: clientSnapshot,
      execution_address: toExecutionAddressPayload(addr, clientAddressId),
      period_start_at: localDatetimeToIso(periodStartDate, periodStartTime),
      period_end_at: localDatetimeToIso(periodEndDate, periodEndTime),
      equipment: equipmentPayload,
      observations: observations.trim() || null,
      billing_mode: billingMode,
      currency: "BRL",
      items: items.map((it, idx) => ({
        kind: it.kind,
        product_id: it.product_id ?? null,
        name: it.name,
        description: it.description ?? null,
        unit: it.unit ?? "UN",
        quantity: Number(it.quantity) || 1,
        unit_price_cents: Number(it.unit_price_cents) || 0,
        discount_cents: Number(it.discount_cents) || 0,
        sort_order: idx,
      })),
    };
    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <section className="space-y-3 rounded-lg border border-border/70 bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cliente
        </h2>
        <ClientSearchCombobox
          value={clientId}
          onChange={(id) => {
            skipNextClientAddressPrefill.current = false;
            setClientId(id);
          }}
          selectedLabel={clientLabel || undefined}
          remoteSearch
          disabled={lockClientPicker || submitting}
          onClientCreated={(c) => {
            skipNextClientAddressPrefill.current = false;
            setClientId(c.id);
            setClientLabel([c.name, c.company].filter(Boolean).join(" · "));
            setClientSnapshot(clientToSnapshot(c));
          }}
        />

        <div className="space-y-3 border-t border-border/60 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Endereço de execução
          </h3>

          {clientId && (loadingAddresses || clientAddresses.length > 0) ? (
            <div className="space-y-1 max-w-xl">
              <Label>Endereço do cliente</Label>
              <Select
                value={addressSelect}
                onValueChange={onAddressSelectChange}
                disabled={submitting || loadingAddresses}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingAddresses ? "Carregando…" : "Selecionar endereço"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {clientAddresses.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                      {a.is_default ? " (padrão)" : ""} — {formatClientAddressLine(a)}
                    </SelectItem>
                  ))}
                  <SelectItem value={MANUAL_ADDRESS}>Outro (preenchimento manual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-6">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="os-cep">CEP</Label>
              <div className="relative">
                <Input
                  id="os-cep"
                  value={addr.postal_code}
                  onChange={(e) => {
                    lastCepLookup.current = "";
                    if (addressSelect !== MANUAL_ADDRESS) setAddressSelect(MANUAL_ADDRESS);
                    patchAddr({ postal_code: formatCepMask(e.target.value) });
                  }}
                  placeholder="00000-000"
                  inputMode="numeric"
                  disabled={submitting}
                  className={cepLoading ? "pr-9" : undefined}
                />
                {cepLoading ? (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              {cepHint ? <p className="text-xs text-muted-foreground">{cepHint}</p> : null}
            </div>
            <div className="space-y-1 sm:col-span-4">
              <Label htmlFor="os-street">Rua / logradouro</Label>
              <Input
                id="os-street"
                value={addr.street}
                onChange={(e) => {
                  if (addressSelect !== MANUAL_ADDRESS) setAddressSelect(MANUAL_ADDRESS);
                  patchAddr({ street: e.target.value });
                }}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="os-number">Número</Label>
              <Input
                id="os-number"
                value={addr.number}
                onChange={(e) => {
                  if (addressSelect !== MANUAL_ADDRESS) setAddressSelect(MANUAL_ADDRESS);
                  patchAddr({ number: e.target.value });
                }}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 sm:col-span-4">
              <Label htmlFor="os-compl">Complemento</Label>
              <Input
                id="os-compl"
                value={addr.complement}
                onChange={(e) => {
                  if (addressSelect !== MANUAL_ADDRESS) setAddressSelect(MANUAL_ADDRESS);
                  patchAddr({ complement: e.target.value });
                }}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="os-bairro">Bairro</Label>
              <Input
                id="os-bairro"
                value={addr.neighborhood}
                onChange={(e) => {
                  if (addressSelect !== MANUAL_ADDRESS) setAddressSelect(MANUAL_ADDRESS);
                  patchAddr({ neighborhood: e.target.value });
                }}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor="os-city">Cidade</Label>
              <Input
                id="os-city"
                value={addr.city}
                onChange={(e) => {
                  if (addressSelect !== MANUAL_ADDRESS) setAddressSelect(MANUAL_ADDRESS);
                  patchAddr({ city: e.target.value });
                }}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="os-uf">UF</Label>
              <Input
                id="os-uf"
                value={addr.state}
                onChange={(e) => {
                  if (addressSelect !== MANUAL_ADDRESS) setAddressSelect(MANUAL_ADDRESS);
                  patchAddr({ state: e.target.value.toUpperCase().slice(0, 2) });
                }}
                maxLength={2}
                disabled={submitting}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border/70 bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Período de execução
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
            <p className="text-sm font-medium">Entrada</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="os-start-date">Data</Label>
                <Input
                  id="os-start-date"
                  type="date"
                  value={periodStartDate}
                  onChange={(e) => setPeriodStartDate(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="os-start-time">Horário</Label>
                <Input
                  id="os-start-time"
                  type="time"
                  value={periodStartTime}
                  onChange={(e) => setPeriodStartTime(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
            <p className="text-sm font-medium">Saída</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="os-end-date">Data</Label>
                <Input
                  id="os-end-date"
                  type="date"
                  value={periodEndDate}
                  onChange={(e) => setPeriodEndDate(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="os-end-time">Horário</Label>
                <Input
                  id="os-end-time"
                  type="time"
                  value={periodEndTime}
                  onChange={(e) => setPeriodEndTime(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-1 max-w-xs">
          <Label>Faturamento</Label>
          <Select
            value={billingMode}
            onValueChange={(v) => setBillingMode(v as ServiceOrderBillingMode)}
            disabled={submitting}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual (botão gerar fatura)</SelectItem>
              <SelectItem value="auto_on_sign">Automático ao assinar</SelectItem>
              <SelectItem value="none">Sem fatura</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border/70 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Equipamento (opcional)
          </h2>
          {!equipmentEditorOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting || equipmentDrafts.length >= 20}
              onClick={openAddEquipmentEditor}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Adicionar equipamento
            </Button>
          ) : null}
        </div>

        {equipmentEditorOpen ? (
          <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">
              {equipmentEditorMode === "edit" ? "Editar equipamento" : "Novo equipamento"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input
                  value={equipmentForm.name}
                  onChange={(e) => setEquipmentForm((p) => ({ ...p, name: e.target.value }))}
                  disabled={submitting}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input
                  value={equipmentForm.brand}
                  onChange={(e) => setEquipmentForm((p) => ({ ...p, brand: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1">
                <Label>Modelo</Label>
                <Input
                  value={equipmentForm.model}
                  onChange={(e) => setEquipmentForm((p) => ({ ...p, model: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1">
                <Label>Série</Label>
                <Input
                  value={equipmentForm.serial}
                  onChange={(e) => setEquipmentForm((p) => ({ ...p, serial: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Defeito</Label>
                <Textarea
                  value={equipmentForm.defects}
                  onChange={(e) => setEquipmentForm((p) => ({ ...p, defects: e.target.value }))}
                  rows={2}
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={closeEquipmentEditor}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={submitting || !isEquipmentDraftFilled(equipmentForm)}
                onClick={saveEquipmentEditor}
              >
                {equipmentEditorMode === "edit" ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </div>
        ) : null}

        {!equipmentEditorOpen && equipmentDrafts.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum equipamento adicionado.</p>
        ) : null}

        {equipmentDrafts.length > 0 ? (
          <ul className="space-y-2">
            {equipmentDrafts.map((eq) => {
              const expanded = equipmentExpandedKey === eq.key;
              return (
                <li
                  key={eq.key}
                  className="rounded-md border border-border/60 bg-background/60"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      setEquipmentExpandedKey((prev) => (prev === eq.key ? null : eq.key))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEquipmentExpandedKey((prev) => (prev === eq.key ? null : eq.key));
                      }
                    }}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{equipmentRowLabel(eq)}</p>
                      {!expanded ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {eq.defects.trim()
                            ? `Defeito: ${eq.defects.trim()}`
                            : "Defeito: não informado"}
                        </p>
                      ) : null}
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={submitting || equipmentEditorOpen}
                        onClick={() => openEditEquipmentEditor(eq)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-destructive hover:text-destructive"
                        disabled={submitting || equipmentEditorOpen}
                        onClick={() => {
                          setEquipmentDrafts((prev) => prev.filter((d) => d.key !== eq.key));
                          setEquipmentExpandedKey((prev) => (prev === eq.key ? null : prev));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="border-t border-border/50 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Defeito</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">
                        {eq.defects.trim() || "não informado"}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Serviços e produtos
        </h2>
        {loadingCatalog ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo…
          </div>
        ) : (
          <ServiceOrderItemsEditor
            items={items}
            onChange={setItems}
            catalog={catalog}
            disabled={submitting}
          />
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-border/70 bg-card p-4 sm:p-5">
        <Label htmlFor="os-obs">Observações</Label>
        <Textarea
          id="os-obs"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          rows={3}
          disabled={submitting}
        />
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {mode === "create" ? "Criar ordem de serviço" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
