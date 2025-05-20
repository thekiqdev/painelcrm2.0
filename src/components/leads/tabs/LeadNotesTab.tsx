
import React from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const noteFormSchema = z.object({
  content: z.string().min(1, { message: "Conteúdo é obrigatório" }),
});

type NoteFormValues = z.infer<typeof noteFormSchema>;

interface LeadNotesTabProps {
  initialContent: string;
  onSaveNote: (values: NoteFormValues) => void;
}

const LeadNotesTab: React.FC<LeadNotesTabProps> = ({
  initialContent,
  onSaveNote,
}) => {
  const noteForm = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      content: initialContent,
    },
  });

  return (
    <TabsContent value="notes">
      <Form {...noteForm}>
        <form onSubmit={noteForm.handleSubmit(onSaveNote)}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="content">Anotações sobre o lead</Label>
              <Textarea 
                id="content"
                className="min-h-[200px]" 
                placeholder="Adicione informações importantes sobre este lead..." 
                {...noteForm.register("content")}
              />
              {noteForm.formState.errors.content && (
                <p className="text-sm text-red-500">{noteForm.formState.errors.content.message}</p>
              )}
            </div>
            <Button type="submit">Salvar Anotações</Button>
          </div>
        </form>
      </Form>
    </TabsContent>
  );
};

export default LeadNotesTab;
