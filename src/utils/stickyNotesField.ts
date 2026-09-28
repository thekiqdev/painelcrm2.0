import type { StickyNoteData } from "@/components/clients/StickyNote";

function generateId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Lê o campo `notes` (lead ou cliente) no formato JSON de post-its ou texto legado.
 * Texto simples vira um único post-it para não perder histórico.
 */
export function parseStickyNotesFromStored(raw: string | null | undefined): StickyNoteData[] {
  if (raw == null || !String(raw).trim()) return [];
  const s = String(raw).trim();
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x) => x && typeof x === "object")
        .map((x: Record<string, unknown>) => ({
          id: typeof x.id === "string" ? x.id : generateId(),
          content: typeof x.content === "string" ? x.content : "",
          color: typeof x.color === "string" && x.color ? x.color : "bg-yellow-200",
          position:
            x.position && typeof x.position === "object"
              ? (x.position as { x: number; y: number })
              : undefined,
          created_at: typeof x.created_at === "string" ? x.created_at : undefined,
          updated_at: typeof x.updated_at === "string" ? x.updated_at : undefined,
        }));
    }
  } catch {
    // legado: campo era texto livre
  }
  return [
    {
      id: generateId(),
      content: s,
      color: "bg-yellow-200",
      created_at: new Date().toISOString(),
    },
  ];
}

export function stickyNotesToStoredJson(notes: StickyNoteData[]): string {
  return JSON.stringify(notes);
}
