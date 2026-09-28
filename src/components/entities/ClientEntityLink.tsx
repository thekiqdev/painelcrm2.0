import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useEntityNavigation, type EntityOpenMode } from "@/hooks/useEntityNavigation";
import { cn } from "@/lib/utils";
import { isValidEntityId } from "@/lib/entityNavigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type ClientEntityLinkProps = {
  clientId?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  subtitle?: string | null;
  variant?: "inline" | "table" | "card" | "compact";
  disabledFallbackText?: string | null;
  className?: string;
  /** Use inside clickable rows/cards so navigating to the client does not trigger the parent action. */
  stopPropagationOnClick?: boolean;
  /** `drawer` abre painel lateral; `route` navega para o perfil. */
  openMode?: EntityOpenMode;
  /** Quando true (padrão), mostra avatar/iniciais ao lado do nome. */
  showAvatar?: boolean;
};

function displayLabel(name: string | null | undefined, disabledFallbackText: string | null | undefined): string {
  const n = name?.trim();
  if (n) return n;
  const f = disabledFallbackText?.trim();
  if (f) return f;
  return "Sem cliente";
}

function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function ClientAvatarChip({
  label,
  avatarUrl,
  size = "sm",
}: {
  label: string;
  avatarUrl?: string | null;
  size?: "sm" | "md";
}) {
  const dim = size === "md" ? "h-8 w-8 text-[11px]" : "h-7 w-7 text-[10px]";
  return (
    <Avatar className={cn("shrink-0 border border-border/60", dim)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-muted font-semibold text-muted-foreground">
        {initialsFromLabel(label)}
      </AvatarFallback>
    </Avatar>
  );
}

export function ClientEntityLink({
  clientId,
  name,
  avatarUrl,
  subtitle,
  variant = "inline",
  disabledFallbackText,
  className,
  stopPropagationOnClick,
  openMode = "drawer",
  showAvatar = true,
}: ClientEntityLinkProps) {
  const { canView, loading } = useModulePermissions();
  const { openEntity } = useEntityNavigation();
  const resolvedId =
    clientId == null || clientId === ""
      ? ""
      : typeof clientId === "string"
        ? clientId.trim()
        : String(clientId).trim();
  const label = displayLabel(name, disabledFallbackText);
  const idOk = isValidEntityId(resolvedId || undefined);
  const allowLink = Boolean(idOk && resolvedId && !loading && canView("clients"));
  const withAvatar = showAvatar && (variant === "table" || variant === "card" || variant === "compact" || variant === "inline");

  const plainTitle = label;
  const linkTitle =
    label === "Abrir cliente no CRM" ? "Abrir cliente no CRM" : `Abrir cliente no CRM — ${label}`;
  const st = subtitle?.trim();

  const subtitleNode = st ? (
    <span className="truncate text-xs font-normal text-muted-foreground" title={st}>
      {st}
    </span>
  ) : null;

  const avatarNode = withAvatar ? (
    <ClientAvatarChip label={label} avatarUrl={avatarUrl} size={variant === "card" ? "md" : "sm"} />
  ) : null;

  const plainClass = cn(
    "text-inherit",
    variant === "table" && "truncate align-middle leading-normal",
    variant === "compact" && "truncate",
    className,
  );

  if (!allowLink) {
    return (
      <span className="inline-flex min-w-0 max-w-full flex-col gap-0.5">
        <span className={cn("inline-flex min-w-0 max-w-full items-center gap-2", withAvatar && "pr-0.5")}>
          {avatarNode}
          <span className={plainClass} title={plainTitle}>
            {label}
          </span>
        </span>
        {subtitleNode}
      </span>
    );
  }

  const linkBase = cn(
    "cursor-pointer underline-offset-2 transition-colors hover:underline",
    variant === "table" &&
      "inline-flex max-w-full items-center gap-2 align-middle text-sm leading-normal text-muted-foreground decoration-muted-foreground/50 hover:text-foreground hover:decoration-foreground/40",
    variant === "inline" &&
      "inline-flex max-w-full items-center gap-2 text-foreground/90 decoration-foreground/35 hover:text-foreground hover:decoration-foreground/50",
    variant === "card" &&
      "inline-flex min-w-0 max-w-full items-center gap-2 font-medium text-foreground/90 decoration-foreground/35 hover:text-foreground",
    variant === "compact" &&
      "inline-flex min-w-0 max-w-full items-center gap-2 truncate text-foreground/90 decoration-foreground/35 hover:text-foreground",
    className,
  );

  const labelWrap = cn("min-w-0", (variant === "table" || variant === "compact") && "truncate");

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagationOnClick) e.stopPropagation();
    e.preventDefault();
    openEntity("client", resolvedId, { mode: openMode });
  };

  return (
    <span className="inline-flex min-w-0 max-w-full flex-col gap-0.5">
      <button
        type="button"
        className={cn(linkBase, "border-0 bg-transparent p-0 text-left font-inherit")}
        title={linkTitle}
        aria-label={linkTitle}
        onClick={handleClick}
      >
        {avatarNode}
        <span className={labelWrap}>{label}</span>
      </button>
      {subtitleNode}
    </span>
  );
}
