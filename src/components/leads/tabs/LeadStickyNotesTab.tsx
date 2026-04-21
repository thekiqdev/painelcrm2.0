import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StickyNote, StickyNoteData } from "@/components/clients/StickyNote";
import { parseStickyNotesFromStored, stickyNotesToStoredJson } from "@/utils/stickyNotesField";

interface LeadStickyNotesTabProps {
  notesRaw: string | null | undefined;
  onSaveNotesJson: (notesJson: string) => void | Promise<void>;
}

const LeadStickyNotesTab: React.FC<LeadStickyNotesTabProps> = ({
  notesRaw,
  onSaveNotesJson,
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
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Notas autoadesivas</h3>
          <Button onClick={handleAddNote} size="sm" type="button">
            <Plus className="mr-2 h-4 w-4" />
            Nova nota
          </Button>
        </div>
        <div className="relative min-h-[320px] max-h-[min(480px,55vh)] overflow-y-auto p-4 bg-muted/40 rounded-lg border border-border/60">
          {notes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {notes.map((note) => (
                <StickyNote
                  key={note.id}
                  note={note}
                  onUpdate={handleUpdateNote}
                  onDelete={handleDeleteNote}
                  onColorChange={handleColorChange}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[240px] text-center">
              <p className="text-muted-foreground mb-4">Nenhuma nota cadastrada</p>
              <Button onClick={handleAddNote} variant="outline" type="button">
                <Plus className="mr-2 h-4 w-4" />
                Criar primeira nota
              </Button>
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
};

export default LeadStickyNotesTab;
