import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ChatKanbanEmptyState({ icon: Icon, title, description, actionLabel, onAction }: Props) {
  return (
    <Card className="border-dashed bg-muted/20 shadow-none max-w-lg mx-auto">
      <CardContent className="flex flex-col items-center text-center py-12 px-6">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <Icon className="h-10 w-10 text-primary" aria-hidden />
        </div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">{description}</p>
        {actionLabel && onAction ? (
          <Button type="button" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
