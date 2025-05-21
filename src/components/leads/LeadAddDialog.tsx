
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import LeadFormFields from "./LeadFormFields";
import { withUserId } from "@/utils/auth-helpers";

const leadFormSchema = z.object({
  name: z.string().min(2, { message: "Nome é obrigatório" }),
  company: z.string().optional(),
  email: z.string().email({ message: "E-mail inválido" }).optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.string(),
  source: z.string(),
  notes: z.string().optional(),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;

interface LeadAddDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: LeadFormValues) => void;
  leadStatuses: any[];
}

const LeadAddDialog: React.FC<LeadAddDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  leadStatuses,
}) => {
  const leadForm = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
      status: "Novo",
      source: "Direto",
      notes: "",
    },
  });

  const handleSubmit = async (values: LeadFormValues) => {
    const dataWithUserId = await withUserId(values);
    if (dataWithUserId) {
      onSave(dataWithUserId);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar Lead</DialogTitle>
          <DialogDescription>
            Preencha os dados para adicionar um novo lead ao sistema.
          </DialogDescription>
        </DialogHeader>
        <Form {...leadForm}>
          <form onSubmit={leadForm.handleSubmit(handleSubmit)}>
            <div className="grid gap-6 py-4">
              <LeadFormFields form={leadForm} leadStatuses={leadStatuses} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar Lead</Button>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default LeadAddDialog;
