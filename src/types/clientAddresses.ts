export interface ClientAddress {
  id: string;
  tenant_id: string;
  client_id: string;
  label: string;
  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  is_default: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientAddressInput = {
  label?: string | null;
  postal_code?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  is_default?: boolean;
};

export function formatClientAddressLine(a: Pick<
  ClientAddress,
  "street" | "number" | "complement" | "neighborhood" | "city" | "state" | "postal_code"
>): string {
  const streetPart = [a.street, a.number].filter(Boolean).join(", ");
  const withCompl = [streetPart, a.complement].filter(Boolean).join(" — ");
  const cityUf = [a.city, a.state].filter(Boolean).join("/");
  const parts = [withCompl, a.neighborhood, cityUf, a.postal_code].filter(Boolean);
  return parts.join(" · ") || "Endereço sem detalhes";
}
