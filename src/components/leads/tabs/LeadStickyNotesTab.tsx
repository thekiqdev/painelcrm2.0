import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StickyNote, StickyNoteData } from "@/components/clients/StickyNote";
import { parseStickyNotesFromStored, stickyNotesToStoredJson } from "@/utils/stickyNotesField";

interface LeadStickyNotesTabProps {
  notesRaw: string | null | undefined;
  onSaveNotesJson: (notesJson: string) => void | Promise<void>;
  canEditNotes?: boolean;
}

const LeadStickyNotesTab: React.FC<LeadStickyNotesTabProps> = ({
  notesRaw,
  onSaveNotesJson,
  canEditNotes = true,
}) => {
  const [notes, setNotes] = useState<StickyNoteData[]>(() => parseStickyNotesFromStored(notesRaw));

  useEffect(() => {
    setNotes(parseStickyNotesFromStored(notesRaw));
  }, [notesRaw]);

  const persist = async (next: StickyNoteData[]) => {
    setNotes(next);
    await onSaveNotesJson(stickyNotesToStoredJson(next));
  };

  const handleAddNote = () => {
    const newNote: StickyNoteData = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      content: "",
      color: "bg-yellow-200",
      created_at: new Date().toISOString(),
    };
    void persist([...notes, newNote]);
  };

  const handleUpdateNote = async (id: string, content: string) => {
    const updatedNotes = notes.map((note) =>
      note.id === id ? { ...note, content, updated_at: new Date().toISOString() } : note
    );
    await persist(updatedNotes);
  };

  const handleDeleteNote = async (id: string) => {
    await persist(notes.filter((note) => note.id !== id));
  };

  const handleColorChange = async (id: string, color: string) => {
    const updatedNotes = notes.map((note) => (note.id === id ? { ...note, color } : note));
    await persist(updatedNotes);
  };

  return (
    <TabsContent value="notes">
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold tracking-tight md:text-lg md:font-medium">Notas autoadesivas</h3>
          {canEditNotes ? (
          <Button onClick={handleAddNote} size="sm" type="button" className="h-8 shrink-0 text-xs md:h-9 md:text-sm">
            <Plus className="mr-2 h-4 w-4" />
            Nova nota
          </Button>
          ) : null}
        </div>
        <div className="relative max-h-[min(480px,55vh)] min-h-[260px] overflow-y-auto rounded-xl border border-border/55 bg-muted/35 p-3 md:min-h-[320px] md:rounded-lg md:bg-muted/40 md:p-4">
          {notes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {notes.map((note) => (
                canEditNotes ? (
                  <StickyNote
                    key={note.id}
                    note={note}
                    onUpdate={handleUpdateNote}
                    onDelete={handleDeleteNote}
                    onColorChange={handleColorChange}
                  />
                ) : (
                  <div key={note.id} className={`${note.color || "bg-yellow-200"} rounded-lg border p-4 text-sm text-zinc-950 [color-scheme:light]`}>
                    <p className="whitespace-pre-wrap break-words">{note.content || "Nota vazia"}</p>
                  </div>
                )
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[240px] text-center">
              <p className="text-muted-foreground mb-4">Nenhuma nota cadastrada</p>
              {canEditNotes ? (
              <Button onClick={handleAddNote} variant="outline" type="button">
                <Plus className="mr-2 h-4 w-4" />
                Criar primeira nota
              </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
};

export default LeadStickyNotesTab;
