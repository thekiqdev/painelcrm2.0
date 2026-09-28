import { apiClient } from "@/integrations/api/client";
import { isValidEntityId } from "@/lib/entityNavigation";

export type EntityKind = "client" | "lead";

export type EntityIdentityInput = {
  entityType: EntityKind;
  entityId: string;
  /** Alias do id do lead (opcional). */
  id?: string;
  converted_to_client_id?: string | null;
  migrated_client_id?: string | null;
};

export type ResolvedEntityIdentity = {
  entityType: EntityKind;
  entityId: string;
  /** Preenchido quando um lead convertido foi resolvido para cliente. */
  originalLeadId?: string;
};

/** Lê o client id de um lead convertido (ambos os nomes de campo usados no CRM). */
export function pickConvertedClientId(
  entity: Pick<EntityIdentityInput, "converted_to_client_id" | "migrated_client_id"> | null | undefined,
): string | null {
  if (!entity) return null;
  const raw = entity.converted_to_client_id ?? entity.migrated_client_id ?? "";
  const trimmed = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  return trimmed && isValidEntityId(trimmed) ? trimmed : null;
}

/**
 * Se o lead já foi convertido, resolve para cliente.
 * Caso contrário mantém tipo/id originais.
 */
export function resolveEntityIdentity(input: EntityIdentityInput): ResolvedEntityIdentity {
  const entityId = input.entityId.trim();
  const convertedId = pickConvertedClientId(input);

  if (input.entityType === "lead" && convertedId) {
    return {
      entityType: "client",
      entityId: convertedId,
      originalLeadId: (input.id ?? entityId).trim() || entityId,
    };
  }

  return {
    entityType: input.entityType,
    entityId,
  };
}

/** Busca `migrated_client_id` / `converted_to_client_id` quando não vier no payload. */
export async function fetchLeadConvertedClientId(leadId: string): Promise<string | null> {
  if (!isValidEntityId(leadId)) return null;
  try {
    const res = await apiClient.get<{
      migrated_client_id?: string | null;
      converted_to_client_id?: string | null;
    }>(`/api/leads/${encodeURIComponent(leadId.trim())}`);
    if (res.error || !res.data) return null;
    return pickConvertedClientId(res.data);
  } catch {
    return null;
  }
}
