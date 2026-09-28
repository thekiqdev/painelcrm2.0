import React, { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinancialAccountSettingsDrawer } from "@/components/finance/FinancialAccountSettingsDrawer";

export interface FinancialAccountSettingsButtonProps {
  accountId: string;
  /** Chamado após guardar qualquer secção (para refrescar a página pai). */
  onSaved?: () => void;
  /** Após a conta ser excluída (ex.: voltar à lista). */
  onDeleted?: () => void;
}

export function FinancialAccountSettingsButton({ accountId, onSaved, onDeleted }: FinancialAccountSettingsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Configurações da conta"
        onClick={() => setOpen(true)}
      >
        <Settings className="h-5 w-5" />
      </Button>

      <FinancialAccountSettingsDrawer
        accountId={accountId}
        open={open}
        onOpenChange={setOpen}
        initialSection="settings"
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </>
  );
}
