
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
import { Save } from "lucide-react";
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

interface LeadEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: LeadFormValues) => void;
  lead: any | null;
  leadStatuses: any[];
}

const LeadEditDialog: React.FC<LeadEditDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  lead,
  leadStatuses,
}) => {
  const editLeadForm = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: lead?.name || "",
      company: lead?.company || "",
      email: lead?.email || "",
      phone: lead?.phone || "",
      status: lead?.status || "Novo",
      source: lead?.source || "Direto",
      notes: lead?.notes || "",
    },
  });

  // Update form when lead changes
  React.useEffect(() => {
    if (lead) {
      editLeadForm.reset({
        name: lead.name,
        company: lead.company || "",
        email: lead.email || "",
        phone: lead.phone || "",
        status: lead.status,
        source: lead.source || "Direto",
        notes: lead.notes || "",
      });
    }
  }, [lead, editLeadForm]);

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
          <DialogTitle>Editar Lead</DialogTitle>
          <DialogDescription>
            Atualize os dados do lead no sistema.
          </DialogDescription>
        </DialogHeader>
        <Form {...editLeadForm}>
          <form onSubmit={editLeadForm.handleSubmit(handleSubmit)}>
            <div className="grid gap-6 py-4">
              <LeadFormFields form={editLeadForm} leadStatuses={leadStatuses} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit">
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Alterações
                </Button>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default LeadEditDialog;
