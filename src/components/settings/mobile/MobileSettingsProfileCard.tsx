import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function MobileSettingsProfileCard({ className }: { className?: string }) {
  const { user, profile } = useAuth();

  const displayName = useMemo(() => {
    const src = profile ?? user;
    const name = `${src?.first_name || ""} ${src?.last_name || ""}`.trim();
    if (name) return name;
    return user?.email?.split("@")[0] || "Usuário";
  }, [profile, user]);

  const initials = useMemo(() => {
    const src = profile ?? user;
    const f = (src?.first_name || "").trim().charAt(0);
    const l = (src?.last_name || "").trim().charAt(0);
    const pair = `${f}${l}`.trim();
    if (pair) return pair.toUpperCase();
    const em = (user?.email || "").trim().charAt(0);
    return em ? em.toUpperCase() : "U";
  }, [profile, user]);

  const avatarSrc = (profile ?? user)?.avatar_url as string | undefined;

  const roleLabel = useMemo(() => {
    if (user?.is_super_admin) return "Super administrador";
    if (user?.is_tenant_admin) return "Administrador da empresa";
    return null;
  }, [user?.is_super_admin, user?.is_tenant_admin]);

  const company = user?.company_name?.trim() || null;

  return (
    <Link
      to="/profile"
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-colors active:bg-muted/40",
        className,
      )}
      aria-label="Ver perfil"
    >
      <Avatar className="h-14 w-14 shrink-0 border border-border/60">
        {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
        <AvatarFallback className="text-base font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{displayName}</p>
        {roleLabel ? <p className="truncate text-sm text-muted-foreground">{roleLabel}</p> : null}
        {company ? <p className="truncate text-xs text-muted-foreground">{company}</p> : null}
        <p className="mt-1 text-xs font-medium text-primary">Ver perfil</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
