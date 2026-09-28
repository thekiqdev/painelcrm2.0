import { cn } from '@/lib/utils';
import { contrastingTextForBg, normalizeHexColor } from '@/lib/chatKanbanTagStyle';

type Props = {
  label: string;
  color?: string | null;
  className?: string;
};

export function ChatKanbanTagBadge({ label, color, className }: Props) {
  const bg = normalizeHexColor(color ?? undefined);
  const fg = contrastingTextForBg(bg);
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center truncate rounded-full px-1.5 py-0 text-[10px] font-medium leading-tight',
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
      title={label}
    >
      {label}
    </span>
  );
}
