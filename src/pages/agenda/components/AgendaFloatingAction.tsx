import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  visible: boolean;
  onClick: () => void;
  label?: string;
};

/**
 * Barra fixa inferior (mobile), alinhada ao padrão de outras áreas do PainelCRM — fundo sólido,
 * largura total, botão retangular, acima da bottom navigation. md+ não renderiza.
 */
export function AgendaFloatingAction({ visible, onClick, label = 'Novo compromisso' }: Props) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-[45] border-t border-border/70 bg-background shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.08)] md:hidden dark:bg-background"
      style={{ bottom: 'max(4.75rem, calc(env(safe-area-inset-bottom, 0px) + 3.5rem))' }}
    >
      <div className="px-4 pb-[max(0.5rem,calc(env(safe-area-inset-bottom,0px)*0.35))] pt-2.5">
        <Button
          type="button"
          size="lg"
          className="h-11 w-full gap-2 font-semibold shadow-sm"
          onClick={onClick}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </Button>
      </div>
    </div>
  );
}
