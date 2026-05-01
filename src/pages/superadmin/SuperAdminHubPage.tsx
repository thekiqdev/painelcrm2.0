import { Navigate, useLocation } from "react-router-dom";
import { SuperAdminAreaHub } from "@/components/superadmin/SuperAdminAreaHub";
import { getSuperAdminHubByPath } from "@/layouts/superadminHubConfig";

/**
 * Página hub única: o path atual determina o conteúdo via `getSuperAdminHubByPath`.
 */
export default function SuperAdminHubPage() {
  const { pathname } = useLocation();
  const def = getSuperAdminHubByPath(pathname);

  if (!def) {
    return <Navigate to="/superadmin" replace />;
  }

  return (
    <SuperAdminAreaHub title={def.title} description={def.description} cards={def.cards} />
  );
}
