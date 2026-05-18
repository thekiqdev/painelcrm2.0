import { useEffect, useMemo, useState } from "react";
import { chatService } from "@/services/chat";
import { resolveProfileAvatarUrl } from "@/utils/chatIdentityDisplay";

type EntityLike = {
  name?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
  whatsapp_avatar_url?: string | null;
};

/**
 * Mesma cadeia de avatar do perfil do cliente, lista de clientes e chat:
 * CRM (avatar_url / photo) → whatsapp do payload → GET /api/chat/crm-whatsapp-identity.
 */
export function useEntityWhatsappAvatar(params: {
  entityKind: "client" | "lead";
  entityId: string | null | undefined;
  entity?: EntityLike | null;
  enabled?: boolean;
}): string | null {
  const { entityKind, entityId, entity, enabled = true } = params;
  const initialFromEntity = entity?.whatsapp_avatar_url?.trim() || null;

  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(initialFromEntity);

  useEffect(() => {
    setWhatsappUrl(initialFromEntity);
  }, [entityId, initialFromEntity]);

  useEffect(() => {
    if (!enabled || !entityId?.trim()) return;

    let cancelled = false;
    void (async () => {
      try {
        const r = await chatService.getCrmWhatsappIdentity(
          entityKind === "client" ? { clientId: entityId.trim() } : { leadId: entityId.trim() },
        );
        if (!cancelled) {
          setWhatsappUrl((prev) => r.avatarUrl?.trim() || prev || initialFromEntity || null);
        }
      } catch {
        if (!cancelled) {
          setWhatsappUrl(initialFromEntity);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, entityId, entityKind, initialFromEntity]);

  return useMemo(() => {
    const resolved = resolveProfileAvatarUrl(entity ?? {}, whatsappUrl ?? initialFromEntity ?? null);
    return resolved.src;
  }, [entity, whatsappUrl, initialFromEntity]);
}
