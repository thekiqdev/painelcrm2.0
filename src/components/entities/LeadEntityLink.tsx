import { useModulePermissions } from "@/contexts/ModulePermissionsContext";

import { useEntityNavigation, type EntityOpenMode } from "@/hooks/useEntityNavigation";

import { pickConvertedClientId } from "@/lib/entity/resolveEntityIdentity";

import { cn } from "@/lib/utils";

import { isValidEntityId } from "@/lib/entityNavigation";

import { ClientEntityLink } from "./ClientEntityLink";



export type LeadEntityLinkProps = {

  leadId?: string | null;

  name?: string | null;

  variant?: "inline" | "table" | "compact";

  disabledFallbackText?: string | null;

  className?: string;

  stopPropagationOnClick?: boolean;

  openMode?: EntityOpenMode;

  convertedToClientId?: string | null;

  /** Alias API (`migrated_client_id`). */

  migratedClientId?: string | null;

};



function displayLabel(name: string | null | undefined, disabledFallbackText: string | null | undefined): string {

  const n = name?.trim();

  if (n) return n;

  const f = disabledFallbackText?.trim();

  if (f) return f;

  return "Lead";

}



export function LeadEntityLink({

  leadId,

  name,

  variant = "inline",

  disabledFallbackText,

  className,

  stopPropagationOnClick,

  openMode = "drawer",

  convertedToClientId,

  migratedClientId,

}: LeadEntityLinkProps) {

  const { canView, loading } = useModulePermissions();

  const { openEntity } = useEntityNavigation();

  const resolvedId =

    leadId == null || leadId === ""

      ? ""

      : typeof leadId === "string"

        ? leadId.trim()

        : String(leadId).trim();



  const convertedClientId = pickConvertedClientId({

    converted_to_client_id: convertedToClientId,

    migrated_client_id: migratedClientId,

  });



  if (convertedClientId && isValidEntityId(convertedClientId) && !loading && canView("clients")) {

    return (

      <ClientEntityLink

        clientId={convertedClientId}

        name={name}

        variant={variant === "compact" ? "compact" : variant === "table" ? "table" : "inline"}

        disabledFallbackText={disabledFallbackText ?? "Cliente"}

        className={className}

        stopPropagationOnClick={stopPropagationOnClick}

        openMode={openMode}

      />

    );

  }



  const label = displayLabel(name, disabledFallbackText);

  const idOk = isValidEntityId(resolvedId || undefined);

  const allowLink = Boolean(idOk && resolvedId && !loading && canView("leads"));



  const linkTitle = label === "Abrir lead" ? "Abrir lead" : `Abrir lead — ${label}`;



  const plainClass = cn(

    "text-inherit",

    variant === "table" && "block max-w-full truncate align-middle leading-normal",

    variant === "compact" && "truncate",

    className,

  );



  if (!allowLink) {

    return (

      <span className={plainClass} title={label}>

        {label}

      </span>

    );

  }



  const linkBase = cn(

    "cursor-pointer underline-offset-2 transition-colors hover:underline",

    variant === "table" &&

      "block max-w-full truncate align-middle text-sm leading-normal text-muted-foreground decoration-muted-foreground/50 hover:text-foreground hover:decoration-foreground/40",

    variant === "inline" &&

      "text-foreground/90 decoration-foreground/35 hover:text-foreground hover:decoration-foreground/50",

    variant === "compact" &&

      "inline-flex min-w-0 max-w-full items-center gap-2 truncate text-foreground/90 decoration-foreground/35 hover:text-foreground",

    className,

  );



  const labelWrap = cn("min-w-0", (variant === "table" || variant === "compact") && "truncate");



  const handleClick = (e: React.MouseEvent) => {

    if (stopPropagationOnClick) e.stopPropagation();

    e.preventDefault();

    openEntity("lead", resolvedId, {

      mode: openMode,

      convertedToClientId: convertedClientId ?? undefined,

      migratedClientId: convertedClientId ?? undefined,

    });

  };



  return (

    <button

      type="button"

      className={cn(linkBase, "border-0 bg-transparent p-0 text-left font-inherit")}

      title={linkTitle}

      aria-label={linkTitle}

      onClick={handleClick}

    >

      <span className={labelWrap}>{label}</span>

    </button>

  );

}


