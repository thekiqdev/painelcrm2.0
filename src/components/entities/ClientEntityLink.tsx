import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useEntityNavigation, type EntityOpenMode } from "@/hooks/useEntityNavigation";
import { cn } from "@/lib/utils";
import { isValidEntityId } from "@/lib/entityNavigation";

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
};

function displayLabel(name: string | null | undefined, disabledFallbackText: string | null | undefined): string {
  const n = name?.trim();
  if (n) return n;
  const f = disabledFallbackText?.trim();
  if (f) return f;
  return "Sem cliente";
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

  const plainTitle = label;
  const linkTitle =
    label === "Abrir cliente no CRM" ? "Abrir cliente no CRM" : `Abrir cliente no CRM — ${label}`;
  const st = subtitle?.trim();

  const subtitleNode = st ? (
    <span className="truncate text-xs font-normal text-muted-foreground" title={st}>
      {st}
    </span>
  ) : null;

  const plainClass = cn(
    "text-inherit",
    variant === "table" && "block max-w-full truncate align-middle leading-normal",
    variant === "compact" && "truncate",
    className,
  );

  if (!allowLink) {
    return (
      <span className="inline-flex min-w-0 max-w-full flex-col gap-0.5">
        <span className={plainClass} title={plainTitle}>
          {label}
        </span>
        {subtitleNode}
      </span>
    );
  }

  const linkBase = cn(
    "cursor-pointer underline-offset-2 transition-colors hover:underline",
    variant === "table" &&
      "block max-w-full truncate align-middle text-sm leading-normal text-muted-foreground decoration-muted-foreground/50 hover:text-foreground hover:decoration-foreground/40",
    variant === "inline" &&
      "text-foreground/90 decoration-foreground/35 hover:text-foreground hover:decoration-foreground/50",
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
        {avatarUrl && (variant === "card" || variant === "compact") ? (
          <img src={avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
        ) : null}
        <span className={labelWrap}>{label}</span>
      </button>
      {subtitleNode}
    </span>
  );
}
