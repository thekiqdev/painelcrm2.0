import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCepMask, lookupViaCep, onlyDigits } from "@/lib/viacep";

export type ClientAddressFormValues = {
  label: string;
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  is_default: boolean;
};

export const emptyClientAddressForm = (): ClientAddressFormValues => ({
  label: "Principal",
  postal_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  is_default: false,
});

type Props = {
  value: ClientAddressFormValues;
  onChange: (next: ClientAddressFormValues) => void;
  disabled?: boolean;
  showDefaultToggle?: boolean;
};

export function ClientAddressFormFields({
  value,
  onChange,
  disabled,
  showDefaultToggle = true,
}: Props) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepHint, setCepHint] = useState<string | null>(null);
  const lastLookedUp = useRef<string>("");
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const digits = onlyDigits(value.postal_code);
    if (digits.length !== 8) {
      setCepHint(null);
      return;
    }
    if (digits === lastLookedUp.current) return;

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setCepLoading(true);
        setCepHint(null);
        const found = await lookupViaCep(digits);
        if (cancelled) return;
        setCepLoading(false);
        lastLookedUp.current = digits;
        if (!found) {
          setCepHint("CEP não encontrado — preencha manualmente");
          return;
        }
        const cur = valueRef.current;
        onChangeRef.current({
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
  }, [value.postal_code]);

  const patch = (partial: Partial<ClientAddressFormValues>) =>
    onChange({ ...value, ...partial });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="addr-label">Identificação</Label>
        <Input
          id="addr-label"
          value={value.label}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder="Principal, Obra, Entrega…"
          disabled={disabled}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="addr-cep">CEP</Label>
          <div className="relative">
            <Input
              id="addr-cep"
              value={value.postal_code}
              onChange={(e) => {
                lastLookedUp.current = "";
                patch({ postal_code: formatCepMask(e.target.value) });
              }}
              placeholder="00000-000"
              inputMode="numeric"
              disabled={disabled}
              className={cepLoading ? "pr-9" : undefined}
            />
            {cepLoading ? (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {cepHint ? <p className="text-xs text-muted-foreground">{cepHint}</p> : null}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="addr-street">Rua / logradouro</Label>
          <Input
            id="addr-street"
            value={value.street}
            onChange={(e) => patch({ street: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-number">Número</Label>
          <Input
            id="addr-number"
            value={value.number}
            onChange={(e) => patch({ number: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="addr-compl">Complemento</Label>
          <Input
            id="addr-compl"
            value={value.complement}
            onChange={(e) => patch({ complement: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-bairro">Bairro</Label>
          <Input
            id="addr-bairro"
            value={value.neighborhood}
            onChange={(e) => patch({ neighborhood: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-city">Cidade</Label>
          <Input
            id="addr-city"
            value={value.city}
            onChange={(e) => patch({ city: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-uf">UF</Label>
          <Input
            id="addr-uf"
            value={value.state}
            onChange={(e) => patch({ state: e.target.value.toUpperCase().slice(0, 2) })}
            maxLength={2}
            disabled={disabled}
          />
        </div>
      </div>

      {showDefaultToggle ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border"
            checked={value.is_default}
            onChange={(e) => patch({ is_default: e.target.checked })}
            disabled={disabled}
          />
          Endereço padrão do cliente
        </label>
      ) : null}
    </div>
  );
}
