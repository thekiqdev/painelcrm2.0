import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ChatbotFlow } from '@/services/chatbotFlows';

/** Liga = ativo no WhatsApp (publicado/desatualizado); desliga = rascunho. */
export function isFlowPublishToggleOn(flow: Pick<ChatbotFlow, 'status' | 'publish_state'>): boolean {
  if (flow.status === 'archived' || flow.publish_state === 'archived') return false;
  return flow.status === 'active' || flow.publish_state === 'published' || flow.publish_state === 'outdated';
}

type FlowPublishToggleProps = {
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** id único para Label (lista tem vários). */
  id: string;
  className?: string;
  labelClassName?: string;
  onPublish: () => void | Promise<void>;
  onUnpublish: () => void | Promise<void>;
};

/**
 * Chave visual publicar / despublicar (mesmas APIs de publish + revert to draft).
 */
export function FlowPublishToggle({
  checked,
  busy,
  disabled,
  id,
  className,
  labelClassName,
  onPublish,
  onUnpublish,
}: FlowPublishToggleProps) {
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Switch
        id={id}
        checked={checked}
        disabled={disabled || busy}
        onCheckedChange={(next) => {
          if (next === checked) return;
          if (next) void onPublish();
          else void onUnpublish();
        }}
        aria-label={checked ? 'Publicado — desligar para rascunho' : 'Rascunho — ligar para publicar'}
      />
      <Label
        htmlFor={id}
        className={cn(
          'cursor-pointer text-xs font-medium whitespace-nowrap',
          checked ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
          (disabled || busy) && 'pointer-events-none opacity-70',
          labelClassName
        )}
      >
        {busy ? '…' : checked ? 'Publicado' : 'Rascunho'}
      </Label>
    </div>
  );
}
