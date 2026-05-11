import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SupportTicketForm, type SupportTicketFormValues } from './SupportTicketForm';

type SupportMobileTicketSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: SupportTicketFormValues;
  onChange: (patch: Partial<SupportTicketFormValues>) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
};

export function SupportMobileTicketSheet({
  open,
  onOpenChange,
  values,
  onChange,
  onSubmit,
  sending,
}: SupportMobileTicketSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-4 py-4 text-left">
          <SheetTitle>Novo chamado</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <SupportTicketForm
            values={values}
            onChange={onChange}
            onSubmit={onSubmit}
            sending={sending}
            hideHeader
            showSubmitButton={false}
            idPrefix="ps-mobile"
            className="border-0 bg-transparent p-0 shadow-none hover:shadow-none"
          />
        </div>

        <div className="shrink-0 border-t border-border/60 bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button
            type="submit"
            form="ps-mobile-form"
            disabled={sending}
            className="h-11 w-full"
            size="lg"
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
            Enviar chamado
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
