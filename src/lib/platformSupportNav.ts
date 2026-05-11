/** Destino do menu Suporte (landing / navbar). */
export function platformSupportHref(isLoggedIn: boolean): string {
  return isLoggedIn ? '/suporte' : `/login?redirect=${encodeURIComponent('/suporte')}`;
}
