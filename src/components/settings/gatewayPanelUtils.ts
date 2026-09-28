/** Formata data do último teste de conexão (texto relativo amigável). */
export function formatGatewayLastTest(lastAt: string | null): string {
  if (!lastAt) return "Nunca testado";
  const date = new Date(lastAt);
  if (Number.isNaN(date.getTime())) return "Nunca testado";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1) return "Há menos de 1 minuto";
  if (diffMin < 60) return `Há ${diffMin} minuto${diffMin !== 1 ? "s" : ""}`;
  if (diffHour < 24) return `Há ${diffHour} hora${diffHour !== 1 ? "s" : ""}`;
  return `Há ${diffDay} dia${diffDay !== 1 ? "s" : ""}`;
}
