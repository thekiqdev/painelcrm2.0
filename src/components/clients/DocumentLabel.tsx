import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type DocumentLabelProps = {
  htmlFor: string;
  children: string;
  showStar: boolean;
  active: boolean;
  onSelect: () => void;
};

export function DocumentLabel({ htmlFor, children, showStar, active, onSelect }: DocumentLabelProps) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor}>{children}</Label>
      {showStar ? (
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted"
          aria-pressed={active}
          aria-label={active ? `${children} usado nas faturas` : `Usar ${children} nas faturas`}
          onClick={onSelect}
        >
          <Star className={cn("h-3.5 w-3.5", active ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
        </button>
      ) : null}
    </div>
  );
}
